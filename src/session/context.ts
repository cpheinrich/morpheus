import {
  ABSENT,
  CANONICAL_INPUTS,
  leaseAt,
  observeLease,
  type ContextReceipt,
  type LeasePolicy,
  type SessionLease,
} from "./lease.js";
import { fingerprint, readInputs } from "./inputs.js";
import { currentBranch, resolveTrunk, trunkSha, worktreeRoot, type TrunkRef } from "./git.js";
import { projectPolicy, sessionId } from "./policy.js";
import { isAbsolute, relative } from "node:path";
import { clearLease, readLease, writeLease } from "./store.js";

export interface ContextResult {
  /**
   * Null when there is no usable session state. `issue` is what tells absent
   * from corrupt — the distinction the store exists to preserve, and it would
   * be lost by collapsing both to a bare null here.
   */
  lease: SessionLease | null;
  /** Anything the store corrected or refused, surfaced rather than swallowed. */
  issue?: string;
  /** True when the remote was consulted, false when the term was still running. */
  observed: boolean;
  /**
   * Set when the trunk itself is the problem: the configured ref does not
   * exist, rather than the network being down. Both produce an `unknown`
   * lease, and only this tells an operator which — a message blaming the
   * network for a misconfigured ref sends them hunting the wrong thing.
   */
  trunkMissing?: TrunkRef;
  /**
   * Whether the lease reached disk. Separate from `issue` because a
   * filesystem failure and "dropped an advisory label" are not the same
   * answer — folding them into one channel let `refresh` print a ✓ for a
   * receipt that never persisted, and the next governed command then asks for
   * the refresh that just appeared to succeed.
   */
  written: boolean;
}

async function session(root: string): Promise<{ worktree: string; id: string }> {
  const worktree = await worktreeRoot(root);
  return { worktree, id: sessionId(worktree) };
}

function required(policy: LeasePolicy): readonly string[] {
  return policy.requiredInputs ?? CANONICAL_INPUTS;
}

/**
 * Take a new receipt: *the agent asserting it has loaded current state.*
 *
 * This is the only thing that mints a receipt, and it is deliberately a
 * command a person or agent runs rather than something a guard does on their
 * behalf. A guard that took a receipt automatically would be certifying that
 * the records were read by the act of not reading them.
 */
export async function refresh(root: string, now = new Date()): Promise<ContextResult> {
  const { worktree, id } = await session(root);
  const policy = await projectPolicy(worktree);
  const inputs = await readInputs(worktree, required(policy));
  const trunk = await resolveTrunk(worktree, policy.trunk);

  // **Never skipped, whatever is declared.** The read-only commands may take
  // the declaration's word for it because they re-observe the *stored*
  // receipt and recover the moment the network is back. This one *mints* the
  // receipt, and `remoteSha: sha ?? ""` bakes the skip in — after which
  // `gate()`, which observes unconditionally by design, sees a real SHA
  // against an empty one, calls it `refresh_required` rather than `unknown`,
  // and refuses every governed command including the local ones. The refusal
  // says "run context refresh", which regenerates the same receipt. A
  // declaration read without the observation it modifies, one layer below
  // where that was last fixed.
  const observation = await trunkSha(worktree, trunk);
  const sha = observation.sha;

  const receipt: ContextReceipt = {
    version: 1,
    id: `ctx-${now.toISOString()}`,
    createdAt: now.toISOString(),
    // A receipt with no verifiable trunk still records what was read. The
    // lease it produces is `unknown`, which fails closed — but the inputs are
    // real, so the next online check has something to compare against rather
    // than starting over.
    remoteSha: sha ?? "",
    branch: await currentBranch(worktree),
    worktree,
    inputs,
  };

  const lease = observeLease(receipt, { checkedAt: now.toISOString(), remoteSha: sha, inputs }, policy);
  const write = await writeLease(worktree, id, lease);
  return {
    lease,
    observed: true,
    written: write.written,
    ...(write.issue ? { issue: write.issue } : {}),
    ...(observation.reason === "missing" ? { trunkMissing: trunk } : {}),
  };
}

/**
 * Discard the stored receipt, and return what it was.
 *
 * The session-start hook may not *certify* — that would assert the records
 * were read by the act of not reading them — but it may **discard**, and that
 * asymmetry is what closes the last hole in the protocol's scope. The lease is
 * keyed on the worktree, so a session starting where a previous one refreshed
 * three minutes ago inherited its certification, and `context brief` said
 * *"Context is fresh"* to a session that had read nothing — the failure the
 * item opens with, from the surface added to prevent it.
 *
 * **Discarding, not downgrading.** Flipping the stored `status` does not
 * survive the next `check`, which re-observes from the *receipt* and finds it
 * still valid. The receipt is the claim "I read these files", and it belonged
 * to the other session — so a new session genuinely has none.
 *
 * The previous receipt is returned rather than thrown away so the caller can
 * still say what has moved since it was taken. It also lands correctly on a
 * *resumed* session after a context compaction, which is precisely when an
 * agent has lost what it read.
 */
export async function endTerm(root: string): Promise<SessionLease | null> {
  const { worktree, id } = await session(root);
  const { lease } = await readLease(worktree, id);
  if (lease) await clearLease(worktree, id);
  return lease;
}

/**
 * Re-fingerprint records this session just wrote into its own receipt.
 *
 * `pm block` appends to `hq/team/<handle>.md`, which the same project's
 * required set names — so the next gated command past the term is refused for
 * drift *this session authored*, naming a file it wrote a moment ago. The
 * everyday inbox cycle is worse: read the replies, promote to
 * `.agent/decisions.md`, archive, write a fresh inbox, and three of the four
 * canonical records have moved by your own hand.
 *
 * Nothing there is unsafe, and that is exactly the problem. Refusals with no
 * informational content are the highest-frequency source of the gate fatigue
 * this design is otherwise careful about, and they are where "do not refresh
 * without reading" is hardest to hold — there is genuinely nothing to read,
 * so the habit that forms is *refresh to clear the gate*.
 *
 * Re-fingerprinting keeps the assertion **true** rather than re-asserting it
 * blindly — but only where the record was unchanged between the receipt and
 * the write, which is why callers pass the content they read *before* writing.
 *
 * Without that check this is the one path in the protocol that can **destroy**
 * evidence rather than merely fail to act on it. A human replying in the inbox
 * inside the five-minute term is invisible to `check`, which returns early for
 * an in-term lease without re-reading anything; `noteWrite` would then
 * re-fingerprint the file *including their reply* and the drift would never be
 * reported. The receipt is the only record of what was read, so overwriting it
 * loses the reply permanently.
 *
 * Where the pre-write content does not match, the receipt is left alone: the
 * drift is real, the session did not read it, and it should still be reported.
 */
export interface RecordWrite {
  path: string;
  /** Content as it was immediately before writing; null if it did not exist. */
  before: string | null;
}

export async function noteWrite(root: string, writes: readonly RecordWrite[]): Promise<void> {
  if (!writes.length) return;
  const { worktree, id } = await session(root);
  const { lease } = await readLease(worktree, id);
  if (!lease) return;

  // Callers hand over whatever they wrote, which for `pm block` is absolute.
  // Receipt ids are worktree-relative, so an unrelativised path would match
  // nothing and this would be a silent no-op — the failure mode that looks
  // exactly like success.
  const seen = new Map(
    writes.map((w) => [
      isAbsolute(w.path) ? relative(worktree, w.path) : w.path,
      w.before === null ? ABSENT : fingerprint(w.before),
    ]),
  );
  const fresh = new Map((await readInputs(worktree, [...seen.keys()])).map((i) => [i.id, i.fingerprint]));

  // Only records the receipt already covered — a record this session never
  // read does not become read by being written over — and only where what the
  // caller read before writing still matches what the receipt asserts.
  const inputs = lease.receipt.inputs.map((input) =>
    seen.get(input.id) === input.fingerprint && fresh.has(input.id)
      ? { ...input, fingerprint: fresh.get(input.id)! }
      : input,
  );

  await writeLease(worktree, id, { ...lease, receipt: { ...lease.receipt, inputs } });
}

/**
 * Read the current verdict, going to the network only when the term has run
 * out.
 *
 * **This is what the five-minute term is for.** Inside it, the last
 * observation stands and the check costs nothing; past it, the stored
 * *receipt* — not the stored verdict — is re-observed against the trunk and
 * the records as they are now. Re-reading the persisted status instead would
 * make a lease that was fresh at 12:05 answer for 18:00, which is the failure
 * the whole item opens with.
 */
export async function check(
  root: string,
  now = new Date(),
  offline = false,
): Promise<ContextResult> {
  const { worktree, id } = await session(root);
  const { lease: stored, issue } = await readLease(worktree, id);
  if (!stored) {
    return issue
      ? { lease: null, issue, observed: false, written: false }
      : { lease: null, observed: false, written: false };
  }

  // Resolved before either read of the lease. `leaseAt` and `observeLease`
  // taking their policy from different places is the divergence acceptance 7
  // asks to be made impossible — harmless while nothing sets `ttlMs`, and a
  // trap for whatever adds a per-project term.
  const policy = await projectPolicy(worktree);

  const current = leaseAt(stored, now, policy);
  // The term is not the only thing that can make a stored verdict stale. A
  // `git checkout` inside the five minutes puts different canonical records on
  // disk, and the in-term short-circuit would answer from a receipt taken
  // against the other branch's. This is the job the item said `branch` must
  // either get or be removed for — `worktree` got session identity; this is
  // the other half.
  const onBranch = await currentBranch(worktree);
  const sameBranch = onBranch === stored.receipt.branch;
  if (current.status === "fresh" && sameBranch) {
    // Nothing was written, because nothing needed to be — the stored lease is
    // still the current answer.
    return { lease: current, observed: false, written: true };
  }

  // Past the term, or already known stale. Re-observe against the receipt the
  // agent actually took — its `inputs` are the assertion, and comparing new
  // observations to them is the entire mechanism.
  const inputs = await readInputs(worktree, required(policy));
  const trunk = await resolveTrunk(worktree, policy.trunk);
  const observation = offline
    ? ({ sha: null, reason: "unreachable" } as const)
    : await trunkSha(worktree, trunk);
  const lease = observeLease(
    stored.receipt,
    { checkedAt: now.toISOString(), remoteSha: observation.sha, inputs },
    policy,
  );

  const write = await writeLease(worktree, id, lease);
  // A failed write is the module's one fail-open path: the previous lease
  // survives and a `fresh` one inside its term still passes. Carried out to
  // the caller rather than dropped.
  const problem = write.written ? write.issue : (write.issue ?? "lease not persisted");
  return {
    lease,
    observed: true,
    written: write.written,
    ...(problem ? { issue: problem } : {}),
    ...(observation.reason === "missing" ? { trunkMissing: trunk } : {}),
  };
}
