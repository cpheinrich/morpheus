import {
  CANONICAL_INPUTS,
  leaseAt,
  observeLease,
  type ContextReceipt,
  type LeasePolicy,
  type SessionLease,
} from "./lease.js";
import { readInputs } from "./inputs.js";
import { currentBranch, trunkSha, worktreeRoot } from "./git.js";
import { projectPolicy, sessionId } from "./policy.js";
import { readLease, writeLease } from "./store.js";

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
  const sha = await trunkSha(worktree);

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
  return write.issue ? { lease, issue: write.issue, observed: true } : { lease, observed: true };
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
export async function check(root: string, now = new Date()): Promise<ContextResult> {
  const { worktree, id } = await session(root);
  const { lease: stored, issue } = await readLease(worktree, id);
  if (!stored) return issue ? { lease: null, issue, observed: false } : { lease: null, observed: false };

  const current = leaseAt(stored, now);
  if (current.status === "fresh") return { lease: current, observed: false };

  // Past the term, or already known stale. Re-observe against the receipt the
  // agent actually took — its `inputs` are the assertion, and comparing new
  // observations to them is the entire mechanism.
  const policy = await projectPolicy(worktree);
  const inputs = await readInputs(worktree, required(policy));
  const sha = await trunkSha(worktree);
  const lease = observeLease(
    stored.receipt,
    { checkedAt: now.toISOString(), remoteSha: sha, inputs },
    policy,
  );

  const write = await writeLease(worktree, id, lease);
  // A failed write is the module's one fail-open path: the previous lease
  // survives and a `fresh` one inside its term still passes. Carried out to
  // the caller rather than dropped.
  const problem = write.written ? write.issue : (write.issue ?? "lease not persisted");
  return problem ? { lease, issue: problem, observed: true } : { lease, observed: true };
}
