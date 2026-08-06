import { LEASE_TTL_MS } from "../session/lease.js";
import { check as checkContext, refresh as takeReceipt } from "../session/context.js";
import { resolveTrunk, trunkLog, worktreeRoot } from "../session/git.js";
import { projectPolicy } from "../session/policy.js";
import { gate as gateAction, offlineDeclared, type Reach } from "../session/gate.js";

const OK = "✓";
const NO = "✗";

function ago(checkedAt: string, now: Date): string {
  const seconds = Math.round((now.getTime() - Date.parse(checkedAt)) / 1000);
  if (!Number.isFinite(seconds)) return "at an unreadable time";
  if (seconds < 90) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/**
 * Take a receipt, and **show the delta rather than just recording it**.
 *
 * A refresh that silently certifies is a refresh an agent can satisfy without
 * reading anything. Printing what moved — the records by name, and the trunk
 * commits by subject — means the command that certifies is also the command
 * that tells you what you missed.
 */
/**
 * `offline` reaches the *read* below and never the receipt: a refresh is
 * user-initiated and exists precisely to certify, so it has nothing to gain
 * from not asking. The 15s argument was about `brief`, the session-start
 * hook, which mints nothing.
 */
export async function refresh(root: string, offline = offlineDeclared()): Promise<number> {
  const before = await checkContext(root, new Date(), offline);
  const previous = before.lease?.receipt;

  const wt = await worktreeRoot(root);
  const policy = await projectPolicy(wt);
  const trunk = await resolveTrunk(wt, policy.trunk);
  const trunkRef = `${trunk.remote}/${trunk.branch}`;

  const { lease, issue, written, trunkMissing } = await takeReceipt(root);
  if (!lease) {
    console.error(issue ?? "Could not take a context receipt.");
    return 1;
  }

  // A receipt that did not reach disk is not a receipt. Printing ✓ here sends
  // the agent into a loop: the next governed command finds no lease, asks for
  // a refresh, and the refresh appears to succeed again.
  if (!written) {
    console.error(`${NO} Receipt computed but not persisted — ${issue ?? "the lease did not reach disk"}.`);
    console.error(`  Every governed command will keep refusing until \`local/sessions/\` is writable.`);
    return 1;
  }

  // The previous receipt was taken without a verified trunk, so there is no
  // range to show — and silence here lands on the one path where the gate has
  // just said "the remote advanced; determine the canonical delta". Saying
  // there is no baseline is the answer; showing nothing is not.
  if (previous && !previous.remoteSha && lease.receipt.remoteSha) {
    // Answered, not delegated. Printing `git log HEAD..origin/main` here would
    // name a **local remote-tracking ref** that nothing on this path has
    // fetched — the exact stale-local-ref failure `trunkSha` cites as the
    // reason this module uses `ls-remote` at all. The command would answer
    // from whenever the user last fetched, the SHA asserted one line above
    // would not appear in its output, and on a fork with a declared but
    // never-fetched upstream it fails outright. `trunkLog` fetches.
    const behind = await trunkLog(wt, trunk, "HEAD", lease.receipt.remoteSha);
    console.log(`Your previous receipt was taken without a verified trunk (${trunkRef}).`);
    if (behind === null) {
      // Not "nothing there". The fetch after a spell offline is the call that
      // times out, and saying nothing landed would be the most reassuring
      // sentence available for a question that was never answered.
      console.log(`  Could not read ${trunkRef} locally — the fetch did not complete.`);
      console.log(`    git fetch ${trunk.remote} ${trunk.branch} && git log --oneline HEAD..FETCH_HEAD`);
    } else if (behind.length) {
      console.log(`On the trunk and not in this branch:`);
      for (const line of behind.slice(0, 20)) console.log(`  ${line}`);
      if (behind.length > 20) console.log(`  … and ${behind.length - 20} more`);
    } else {
      console.log(`  Nothing on it that this branch does not already have.`);
    }
    console.log("");
  }

  // Both endpoints, not just the old one. `takeReceipt` writes `remoteSha:
  // sha ?? ""` for an unreachable trunk, so an offline refresh after an online
  // one passed this guard and asked git for a range with a defaulted side.
  if (
    previous?.remoteSha &&
    lease.receipt.remoteSha &&
    lease.receipt.remoteSha !== previous.remoteSha
  ) {
    const log = await trunkLog(wt, trunk, previous.remoteSha, lease.receipt.remoteSha);
    if (log === null) {
      // The sibling symptom: this branch used to print nothing at all while
      // the two SHAs genuinely differed.
      // The query that actually failed, not the neighbouring block's. This
      // one asks what landed *since your last receipt*; `HEAD..FETCH_HEAD`
      // asks what is on the trunk and not in this branch, and on a claimed
      // branch those differ. Handing it over is also genuinely better than
      // retrying internally: a shell has no 15s timeout, which is what made
      // the internal call fail after a day away.
      console.log(`The trunk moved, and ${trunkRef} could not be read locally to say how:`);
      console.log(
        `    git fetch ${trunk.remote} ${trunk.branch} && ` +
          `git log --oneline ${previous.remoteSha.slice(0, 7)}..FETCH_HEAD`,
      );
      console.log("");
    } else if (log.length) {
      console.log(`Landed on ${trunkRef} since your last receipt:`);
      for (const line of log.slice(0, 20)) console.log(`  ${line}`);
      if (log.length > 20) console.log(`  … and ${log.length - 20} more`);
      console.log("");
    }
  }

  // Compared receipt-to-receipt, the same way the trunk half compares SHAs —
  // **not** from `before.lease.changedInputs`. A stored lease inside its term
  // comes back unmodified and a fresh one has `changedInputs: []` by
  // construction, so reading the verdict meant a refresh within five minutes
  // of the last one silently re-certified whatever moved during the term.
  if (previous) {
    const was = new Map(previous.inputs.map((i) => [i.id, i.fingerprint]));
    const moved = lease.receipt.inputs
      .filter((i) => was.has(i.id) && was.get(i.id) !== i.fingerprint)
      .map((i) => i.id);
    const added = lease.receipt.inputs.filter((i) => !was.has(i.id)).map((i) => i.id);

    if (moved.length || added.length) {
      console.log("Records that moved since your last receipt — re-read what you rely on:");
      for (const id of [...moved, ...added].sort()) console.log(`  ${id}`);
      console.log("");
    }
  }

  if (issue) console.log(`! ${issue}`);

  if (lease.status === "fresh") {
    console.log(`${OK} Context receipt taken — ${lease.receipt.inputs.length} records, trunk ${lease.receipt.remoteSha.slice(0, 7)}.`);
    console.log(`  Good for ${LEASE_TTL_MS / 60_000} minutes; governed actions will re-check after that.`);
    return 0;
  }

  // A refresh that cannot certify is not a failure to report as success. The
  // usual cause is a record that is missing or unreadable, which no amount of
  // re-reading fixes.
  console.log(`${NO} ${lease.reason ?? "Could not certify context."}`);
  if (lease.unresolvableInputs?.length) {
    console.log(`  Repair these — re-reading will not clear them:`);
    for (const id of lease.unresolvableInputs) console.log(`    ${id}`);
  }
  if (trunkMissing) {
    // Not a network problem, and saying so is the whole point: the operator
    // would otherwise chase connectivity for a ref that does not exist.
    console.log(
      `  \`${trunkMissing.remote}/${trunkMissing.branch}\` does not exist on the remote.`,
    );
    console.log(`  Set \`context.trunk\` in morpheus.json — e.g. "upstream/main" on a fork.`);
  } else if (lease.status === "unknown") {
    console.log(`  The trunk could not be reached. MORPHEUS_OFFLINE=1 permits local work.`);
  }
  return 1;
}

/** Exit non-zero when context is not fresh. For hooks and scripts. */
export async function check(root: string, offline = offlineDeclared()): Promise<number> {
  const { lease, issue } = await checkContext(root, new Date(), offline);
  if (!lease) {
    console.error(issue ?? "No context receipt for this worktree. Run: morpheus context refresh");
    return 1;
  }
  if (lease.status === "fresh") return 0;
  console.error(lease.reason ?? `Context is ${lease.status}.`);
  return 1;
}

export async function status(root: string, offline = offlineDeclared()): Promise<number> {
  const now = new Date();
  const { lease, issue, observed, written, trunkMissing } = await checkContext(root, now, offline);

  if (!lease) {
    console.log(`${NO} No context receipt for this worktree.`);
    if (issue) console.log(`  ${issue}`);
    console.log(`\n  morpheus context refresh`);
    return 1;
  }

  const mark = lease.status === "fresh" ? OK : NO;
  console.log(`${mark} Context is ${lease.status} — checked ${ago(lease.checkedAt, now)}${observed ? "" : ", within term"}.`);
  console.log(`  Receipt covers ${lease.receipt.inputs.length} records against trunk ${lease.receipt.remoteSha.slice(0, 7) || "(unverified)"}.`);
  if (lease.reason) console.log(`  ${lease.reason}`);
  if (issue) console.log(`  ! ${issue}`);
  if (!written) console.log(`  ! This verdict was not persisted — the lease on disk is older than it.`);
  if (trunkMissing) {
    console.log(
      `  ! \`${trunkMissing.remote}/${trunkMissing.branch}\` does not exist — set \`context.trunk\` in morpheus.json.`,
    );
  }
  // On the *observation*, not the declaration. Inside the term `check`
  // returns before `offline` is read at all, so nothing was skipped and the
  // verdict is `fresh` — printing "unknown is assumed" there contradicts the
  // line above it, and "external actions are not permitted" is wrong about
  // behaviour: `gate` returns ok for a fresh lease before the offline branch
  // is reached. `doctor --offline` says so correctly because it genuinely
  // skipped a check it would otherwise have run.
  if (offline && observed) {
    console.log(`  Offline declared: the trunk was not asked about, so "unknown" is assumed.`);
    if (lease.status !== "fresh") {
      console.log(`  Local work is permitted on a clean delta; external actions are not.`);
    }
  }
  return lease.status === "fresh" ? 0 : 1;
}

/**
 * The session-start message, injected into a new session's context by a hook.
 *
 * **Always exits 0**, and that is the point rather than convenience. A hook
 * written as `morpheus context status || true` swallows a missing binary
 * exactly the way it swallows a stale lease — the check that skips what is
 * absent and reports the empty thing as correct. Exiting 0 deliberately, from
 * a command whose job is to inform, keeps the masking out of the shell.
 *
 * It does **not** take a receipt. At session start the agent has read nothing,
 * so a receipt minted here would certify the records were loaded by the act of
 * not loading them.
 */
export async function brief(root: string, offline = offlineDeclared()): Promise<number> {
  const { lease } = await checkContext(root, new Date(), offline);

  if (lease?.status === "fresh") {
    console.log(`Context is fresh — receipt taken ${ago(lease.checkedAt, new Date())}, covering ${lease.receipt.inputs.length} canonical records.`);
    return 0;
  }

  console.log("This session has no current context receipt.");

  // Split, not flattened. `unresolvableInputs` is a subset of `changedInputs`,
  // so listing them together and closing with "run refresh" answers a record
  // that re-reading cannot fix with the one instruction that cannot fix it —
  // the loop `ContextFreshnessError` splits the two to prevent. This is the
  // first thing an agent reads in a session, so it is the surface where the
  // distinction matters most.
  const stuck = lease?.unresolvableInputs ?? [];
  const readable = (lease?.changedInputs ?? []).filter((id) => !stuck.includes(id));

  if (readable.length) {
    console.log("These canonical records are unread or have moved:");
    for (const id of readable) console.log(`  ${id}`);
  } else if (!stuck.length) {
    console.log("Read `.agent/decisions.md` and `.agent/learned.md` before starting work.");
  }

  if (stuck.length) {
    console.log("");
    console.log("These cannot be read at all — repair them; refreshing will not clear it:");
    for (const id of stuck) console.log(`  ${id}`);
  }

  console.log("");
  if (readable.length || !stuck.length) {
    console.log("Then run `morpheus context refresh`. Claiming work, filing items, blocking and");
    console.log("granting access are refused until you do.");
  } else {
    console.log("Claiming work, filing items, blocking and granting access stay refused until");
    console.log("those records are readable.");
  }
  return 0;
}

export interface Guarded {
  /** Non-null is the caller's exit code. */
  refused: number | null;
  /**
   * The offline exception was actually applied — an `unknown` observation and
   * a declaration, not just a declaration. Commands that degrade rather than
   * refuse read this.
   */
  contained: boolean;
}

/**
 * Enforce the gate for a governed command, or explain why not.
 *
 * Returned as a record so `refused` has to be destructured and checked;
 * ignoring it is a type error rather than a silently open gate.
 */
export async function guard(
  root: string,
  action: string,
  reach: Reach,
  offline?: boolean,
): Promise<Guarded> {
  const result = await gateAction(root, action, reach, offline === undefined ? {} : { offline });
  if (result.ok) {
    if (result.message) console.log(`! ${result.message}`);
    return { refused: null, contained: result.contained === true };
  }
  console.error(`Refusing ${action}.\n\n${result.message}`);
  return { refused: 1, contained: false };
}
