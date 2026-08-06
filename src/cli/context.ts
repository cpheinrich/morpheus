import { LEASE_TTL_MS } from "../session/lease.js";
import { check as checkContext, refresh as takeReceipt } from "../session/context.js";
import { trunkLog } from "../session/git.js";
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
export async function refresh(root: string): Promise<number> {
  const before = await checkContext(root);
  const previous = before.lease?.receipt;

  const { lease, issue, written } = await takeReceipt(root);
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

  if (previous && previous.remoteSha && lease.receipt.remoteSha !== previous.remoteSha) {
    const log = await trunkLog(root, previous.remoteSha, lease.receipt.remoteSha);
    if (log.length) {
      console.log(`Landed on main since your last receipt:`);
      for (const line of log.slice(0, 20)) console.log(`  ${line}`);
      if (log.length > 20) console.log(`  … and ${log.length - 20} more`);
      console.log("");
    }
  }

  if (before.lease && before.lease.changedInputs.length) {
    console.log("Records that had moved — re-read anything you are relying on:");
    for (const id of before.lease.changedInputs) console.log(`  ${id}`);
    console.log("");
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
  if (lease.status === "unknown") {
    console.log(`  The trunk could not be reached. MORPHEUS_OFFLINE=1 permits local work.`);
  }
  return 1;
}

/** Exit non-zero when context is not fresh. For hooks and scripts. */
export async function check(root: string): Promise<number> {
  const { lease, issue } = await checkContext(root);
  if (!lease) {
    console.error(issue ?? "No context receipt for this worktree. Run: morpheus context refresh");
    return 1;
  }
  if (lease.status === "fresh") return 0;
  console.error(lease.reason ?? `Context is ${lease.status}.`);
  return 1;
}

export async function status(root: string): Promise<number> {
  const now = new Date();
  const { lease, issue, observed, written } = await checkContext(root, now);

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
  if (offlineDeclared()) console.log(`  MORPHEUS_OFFLINE=1 is set — local work permitted, external actions are not.`);
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
export async function brief(root: string): Promise<number> {
  const { lease } = await checkContext(root);

  if (lease?.status === "fresh") {
    console.log(`Context is fresh — receipt taken ${ago(lease.checkedAt, new Date())}, covering ${lease.receipt.inputs.length} canonical records.`);
    return 0;
  }

  console.log("This session has no current context receipt.");
  if (lease?.changedInputs.length) {
    console.log("These canonical records are unread or have moved:");
    for (const id of lease.changedInputs) console.log(`  ${id}`);
  } else {
    console.log("Read `.agent/decisions.md` and `.agent/learned.md` before starting work.");
  }
  console.log("");
  console.log("Then run `morpheus context refresh`. Claiming work, filing items, blocking and");
  console.log("granting access are refused until you do.");
  return 0;
}

/**
 * Enforce the gate for a governed command, or explain why not.
 *
 * Returns null when the action may proceed. Callers treat a non-null value as
 * their exit code, so forgetting to check it is a type error rather than a
 * silently open gate.
 */
export async function guard(
  root: string,
  action: string,
  reach: Reach,
  offline?: boolean,
): Promise<number | null> {
  const result = await gateAction(root, action, reach, offline === undefined ? {} : { offline });
  if (result.ok) {
    if (result.message) console.log(`! ${result.message}`);
    return null;
  }
  console.error(`Refusing ${action}.\n\n${result.message}`);
  return 1;
}
