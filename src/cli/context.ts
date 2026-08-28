import {
  CANONICAL_INPUTS,
  LEASE_TTL_MS,
  observeLease,
  type ContextReceipt,
  type SessionLease,
} from "../session/lease.js";
import { readInputs } from "../session/inputs.js";
import { check as checkContext, endTerm, refresh as takeReceipt } from "../session/context.js";
import { resolveTrunk, trunkLog, worktreeRoot } from "../session/git.js";
import { projectPolicy } from "../session/policy.js";
import { gate as gateAction, offlineDeclared, type Reach } from "../session/gate.js";
import { CODEX_HOOKS, installContext, type Repair } from "../session/install.js";
import { morpheusInstallStatus, type MorpheusInstallStatus } from "../self.js";

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
 * from not asking.
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
 * What has moved since a receipt, without writing anything.
 *
 * `brief` cannot ask the store: it has just discarded the receipt, which is
 * the point. This is the same observation `check` makes, minus the persistence
 * — a pure read, so the session-start message can still name records rather
 * than only announcing that it has none.
 */
async function sinceReceipt(
  root: string,
  receipt: ContextReceipt,
  now: Date,
): Promise<SessionLease> {
  const wt = await worktreeRoot(root);
  const policy = await projectPolicy(wt);
  const inputs = await readInputs(wt, policy.requiredInputs ?? CANONICAL_INPUTS);

  // **No network call.** `brief` prints `changedInputs` and
  // `unresolvableInputs`, both of which `localDelta` computes from the records
  // alone — the trunk answer cannot change one character of the output. This
  // runs at the start of every session, from a hook, so an `ls-remote` here is
  // a round trip bought for nothing, and a timeout on a slow link would sit in
  // front of the session. `null` is the honest input: the trunk was not asked.
  return observeLease(receipt, { checkedAt: now.toISOString(), remoteSha: null, inputs }, policy);
}

/**
 * The session-start message, injected into a new session's context by a hook.
 *
 * The project-context half is entirely local. One bounded `ls-remote` also
 * checks the installed Morpheus commit: this hook is the one device-wide
 * chokepoint that reaches every project and is where CLI drift can be noticed
 * before a local generator disagrees with canonical CI. An explicit offline
 * declaration skips that check and prints no stale claim.
 *
 * **Not read-only.** It discards the stored receipt, which is what makes the
 * lease session-scoped — so it belongs in a session-start hook and nowhere
 * else. Running it by hand mid-session costs one `context refresh`.
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
export interface BriefOptions {
  offline?: boolean;
  morpheus?: MorpheusInstallStatus;
}

export async function brief(root: string, opts: BriefOptions = {}): Promise<number> {
  const morpheusPromise = opts.morpheus
    ? Promise.resolve(opts.morpheus)
    : morpheusInstallStatus({ offline: opts.offline });
  // **Decertify first.** The lease is keyed on the worktree, so a session
  // starting where a previous one refreshed minutes ago would otherwise
  // inherit its certification — and this command would tell a session that
  // has read nothing that its context is fresh. A hook may not certify; it
  // may end a term, which asserts nothing.
  const previous = await endTerm(root);

  // Computed from the receipt that was discarded, not from the store — which
  // now holds nothing, by design. The discard has to come first (a session
  // must not inherit certification) and the reporting depends on the thing
  // discarded, so `endTerm` returns it rather than dropping it.
  const now = new Date();
  const moved = previous ? await sinceReceipt(root, previous.receipt, now) : null;
  const morpheus = await morpheusPromise;

  if (morpheus.fresh === false) {
    const installed = morpheus.installedSha?.slice(0, 7) ?? "unknown";
    const current = morpheus.remoteSha?.slice(0, 7) ?? "unknown";
    console.log(
      `! Morpheus CLI is not current (${installed} → ${current}). Run \`morpheus self update\`; ` +
        "it will not touch active source work.",
    );
    console.log("");
  }

  if (previous) {
    console.log(
      `This session has no context receipt — the last one was taken ${ago(previous.checkedAt, now)} ` +
        `by another session, covering ${previous.receipt.inputs.length} records.`,
    );
  } else {
    console.log("This session has no context receipt.");
  }
  const lease = moved;

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

/**
 * Wire the session-start hooks and the inbox declaration, or say why not.
 *
 * The counterpart to `brief`: that command runs *because* this one has been
 * run. `morpheus init` writes the same wiring into a new project, and nothing
 * carried it into a project that already existed — so this is the repair path,
 * idempotent, and the one to reach for on an established repository.
 *
 * `--check` reports without writing, for CI and for `doctor`'s
 * recommendation to be worth making.
 */
export async function install(
  root: string,
  opts: { check: boolean; handle?: string },
): Promise<number> {
  const repairs = await installContext(root, { write: !opts.check, handle: opts.handle });

  const mark = (r: Repair): string =>
    r.outcome === "blocked" ? NO : r.outcome === "present" ? "·" : OK;
  const width = Math.max(...repairs.map((r) => r.target.length));
  for (const r of repairs) {
    console.log(`${mark(r)} ${r.target.padEnd(width)}  ${r.detail}`);
  }

  // Named whenever the file is newly wired, because Codex **will not run an
  // untrusted hook** and says nothing when it declines to. A hooks file that
  // exists and never fires is indistinguishable from one that works until
  // somebody notices the brief is missing — the same shape as a check that
  // reports an empty thing as correct, one layer out in the toolchain.
  const codex = repairs.find((r) => r.target === CODEX_HOOKS);
  if (codex && (codex.outcome === "created" || codex.outcome === "updated")) {
    console.log("");
    console.log(`Codex will not run ${CODEX_HOOKS} until the hook is trusted. Once, per project:`);
    console.log("  run `/hooks` in a Codex session and trust it.");
    console.log("  Trust is recorded against the hook's hash, so an edit needs trusting again.");
  }

  const blocked = repairs.filter((r) => r.outcome === "blocked");
  if (blocked.length) {
    console.log("");
    console.log(`${NO} ${blocked.length} of ${repairs.length} could not be wired.`);
    return 1;
  }

  // `--check` fails on anything that is not already true, where a write run
  // fails only on what it could not do. Same data, two questions: *is this
  // project wired* and *did this command wire it*.
  if (opts.check) {
    const missing = repairs.filter((r) => r.outcome !== "present");
    if (missing.length) {
      console.log("");
      console.log(`${NO} Not wired. Run \`morpheus context install\`.`);
      return 1;
    }
    console.log("");
    console.log(`${OK} Wired for both Claude and Codex.`);
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
