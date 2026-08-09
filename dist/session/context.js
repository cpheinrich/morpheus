import { ABSENT, CANONICAL_INPUTS, leaseAt, observeLease, } from "./lease.js";
import { fingerprint, readInputs } from "./inputs.js";
import { currentBranch, resolveTrunk, trunkSha, worktreeRoot } from "./git.js";
import { projectPolicy, sessionId } from "./policy.js";
import { isAbsolute, relative } from "node:path";
import { clearLease, readLease, writeLease } from "./store.js";
async function session(root) {
    const worktree = await worktreeRoot(root);
    return { worktree, id: sessionId(worktree) };
}
function required(policy) {
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
export async function refresh(root, now = new Date()) {
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
    const receipt = {
        version: 1,
        id: `ctx-${now.toISOString()}`,
        createdAt: now.toISOString(),
        // A receipt with no verifiable trunk still records what was read. The
        // lease it produces is `unknown`, which fails closed — but the inputs are
        // real, so the next online check has something to compare against rather
        // than starting over.
        remoteSha: sha ?? "",
        // `""` when the lookup failed — not a name, and `sameBranch` below never
        // matches it, so an unanchorable receipt re-observes rather than
        // short-circuiting.
        branch: (await currentBranch(worktree)) ?? "",
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
export async function endTerm(root) {
    const { worktree, id } = await session(root);
    const { lease } = await readLease(worktree, id);
    if (lease)
        await clearLease(worktree, id);
    return lease;
}
export async function noteWrite(root, writes) {
    if (!writes.length)
        return;
    const { worktree, id } = await session(root);
    const { lease } = await readLease(worktree, id);
    if (!lease)
        return;
    // Callers hand over whatever they wrote, which for `pm block` is absolute.
    // Receipt ids are worktree-relative, so an unrelativised path would match
    // nothing and this would be a silent no-op — the failure mode that looks
    // exactly like success.
    const seen = new Map(writes.map((w) => [
        isAbsolute(w.path) ? relative(worktree, w.path) : w.path,
        w.before === null ? ABSENT : fingerprint(w.before),
    ]));
    const fresh = new Map((await readInputs(worktree, [...seen.keys()])).map((i) => [i.id, i.fingerprint]));
    // Only records the receipt already covered — a record this session never
    // read does not become read by being written over — and only where what the
    // caller read before writing still matches what the receipt asserts.
    const inputs = lease.receipt.inputs.map((input) => seen.get(input.id) === input.fingerprint && fresh.has(input.id)
        ? { ...input, fingerprint: fresh.get(input.id) }
        : input);
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
export async function check(root, now = new Date(), offline = false) {
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
    // Both sides have to be a real answer. A failed lookup is not a branch, and
    // two of them are not the same branch.
    const sameBranch = onBranch !== null && onBranch !== "" && onBranch === stored.receipt.branch;
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
        ? { sha: null, reason: "unreachable" }
        : await trunkSha(worktree, trunk);
    const lease = observeLease(stored.receipt, { checkedAt: now.toISOString(), remoteSha: observation.sha, inputs }, policy);
    // Re-anchored **here**, where the re-observation has just proven the receipt
    // still true against the records on this branch — which covers every route
    // to a switch, not the one command that happens to do it. `pm claim` checks
    // out the branch it stakes, and AGENTS.md prescribes a bare `git checkout`
    // to resume blocked work; a fix at either call site leaves the other, and
    // the mismatch is otherwise permanent for the session even once the receipt
    // is proved current. Only on `fresh`: a lease that failed for any other
    // reason has proved nothing.
    const anchored = lease.status === "fresh" && onBranch !== null && onBranch !== lease.receipt.branch
        ? { ...lease, receipt: { ...lease.receipt, branch: onBranch } }
        : lease;
    const write = await writeLease(worktree, id, anchored);
    // A failed write is the module's one fail-open path: the previous lease
    // survives and a `fresh` one inside its term still passes. Carried out to
    // the caller rather than dropped.
    const problem = write.written ? write.issue : (write.issue ?? "lease not persisted");
    return {
        lease: anchored,
        observed: true,
        written: write.written,
        ...(problem ? { issue: problem } : {}),
        ...(observation.reason === "missing" ? { trunkMissing: trunk } : {}),
    };
}
//# sourceMappingURL=context.js.map