import { assertCurrentSource, containsSource } from "./start.js";
import { ABSENT, CANONICAL_INPUTS, UNREADABLE, leaseAt, observeLease, } from "./lease.js";
import { fingerprint, readInputs, readRecords } from "./inputs.js";
import { evidenceMode, readSnapshot, requirements, writeSnapshot, } from "./certify.js";
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
/** Equal inputs, excluding sentinels: *could not read it* never matches itself. */
function sameInputs(a, b) {
    if (a.length !== b.length)
        return false;
    const was = new Map(a.map((i) => [i.id, i.fingerprint]));
    return b.every((i) => i.fingerprint !== ABSENT && i.fingerprint !== UNREADABLE && was.get(i.id) === i.fingerprint);
}
/**
 * Take a new receipt: *the agent asserting it has loaded current state* — and,
 * where a read hook is watching, the log showing that it did.
 *
 * This is the only thing that mints a receipt, and it is deliberately a
 * command a person or agent runs rather than something a guard does on their
 * behalf. A guard that took a receipt automatically would be certifying that
 * the records were read by the act of not reading them.
 *
 * **Idempotent.** When the trunk and every required record are exactly as the
 * stored receipt saw them, the receipt is extended and nothing is asked: a
 * second refresh used to cost a second full read of 139 KB of decisions, or a
 * pretend one, and transcripts showed both.
 *
 * **Evidence, where it can exist.** With a live read hook, a record is
 * certified only where the session's read log covers it at its current
 * content: the changed hunks against the last receipt, or the whole record
 * when there is no usable baseline. Otherwise nothing is written and the
 * result names what is unread.
 */
export async function refresh(root, now = new Date(), opts = {}) {
    const { worktree, id } = await session(root);
    const policy = await projectPolicy(worktree);
    const records = await readRecords(worktree, required(policy));
    const inputs = records.map(({ id: record, fingerprint: print }) => ({ id: record, fingerprint: print }));
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
    const mode = await evidenceMode(worktree, opts.env ?? process.env);
    const { lease: stored } = await readLease(worktree, id);
    // An asserted receipt — or one taken before evidence existed — is never the
    // baseline a recorded one extends: that would launder the assertion.
    const previous = stored && (mode.kind !== "recorded" || stored.receipt.evidence === "recorded") ? stored.receipt : null;
    if (sha) {
        try {
            const verified = await assertCurrentSource(worktree);
            if (verified !== sha)
                throw new Error("Trunk moved during refresh. Re-read current source and retry.");
        }
        catch (error) {
            // Invalidate the old certification as well as refusing this one.
            await clearLease(worktree, id);
            return { lease: null, observed: true, written: false, previous, extended: false,
                evidence: { mode, requirements: [] },
                issue: error instanceof Error ? error.message : String(error) };
        }
    }
    const needs = mode.kind === "recorded"
        ? await requirements(previous, previous ? await readSnapshot(worktree, id) : new Map(), records, mode.reads)
        : [];
    if (needs.some((r) => r.missing.length)) {
        // Nothing is written: the stored receipt is still the true record of what
        // was read, and the result says what is not.
        return { lease: null, observed: true, written: false, previous, extended: false,
            evidence: { mode, requirements: needs },
            issue: "Read evidence does not cover the records yet." };
    }
    const branch = (await currentBranch(worktree)) ?? "";
    // Unchanged only against a verified trunk: an unreachable one is unknown,
    // never "the same as last time".
    const extended = previous !== null && sha !== null && previous.remoteSha === sha && sameInputs(previous.inputs, inputs);
    const receipt = extended
        ? { ...previous, branch, worktree }
        : {
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
            branch,
            worktree,
            inputs,
            evidence: mode.kind === "recorded" ? "recorded" : "asserted",
        };
    const lease = observeLease(receipt, { checkedAt: now.toISOString(), remoteSha: sha, inputs }, policy);
    const write = await writeLease(worktree, id, lease);
    // The baseline the next refresh diffs against. A failure here costs that
    // refresh a whole-record read, never a false certification.
    if (write.written)
        await writeSnapshot(worktree, id, records).catch(() => undefined);
    return {
        lease,
        observed: true,
        written: write.written,
        previous,
        extended,
        evidence: { mode, requirements: needs },
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
    const written = await readRecords(worktree, [...seen.keys()]);
    const fresh = new Map(written.map((i) => [i.id, i.fingerprint]));
    // Only records the receipt already covered — a record this session never
    // read does not become read by being written over — and only where what the
    // caller read before writing still matches what the receipt asserts.
    const absorbed = new Set();
    const inputs = lease.receipt.inputs.map((input) => {
        if (seen.get(input.id) !== input.fingerprint || !fresh.has(input.id))
            return input;
        absorbed.add(input.id);
        return { ...input, fingerprint: fresh.get(input.id) };
    });
    const write = await writeLease(worktree, id, { ...lease, receipt: { ...lease.receipt, inputs } });
    // The delta baseline follows the receipt: the next refresh diffs against what
    // this session wrote, not against what it read before writing. Without this,
    // its own write would come back as a changed hunk to read.
    if (write.written && absorbed.size) {
        const snapshot = await readSnapshot(worktree, id);
        const records = [...snapshot].map(([record, s]) => ({ id: record, ...s }));
        const next = new Map(records.map((r) => [r.id, r]));
        for (const record of written) {
            if (absorbed.has(record.id) && record.content !== null)
                next.set(record.id, { id: record.id, fingerprint: record.fingerprint, content: record.content });
        }
        await writeSnapshot(worktree, id, [...next.values()]).catch(() => undefined);
    }
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
    if (current.status === "fresh" && sameBranch && await containsSource(worktree, stored.receipt.remoteSha)) {
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
    // Identical context records do not prove identical source. In particular,
    // switching to an older branch (or resetting the same branch) must not
    // re-certify a code-only gap. Repeat this local proof on every read so a
    // failed persistence cannot make the next process trust the old verdict.
    if (lease.status === "fresh" && !await containsSource(worktree, observation.sha ?? "")) {
        lease.status = "refresh_required";
        lease.reason = "Checkout does not contain the observed trunk. Fetch and integrate current source, re-read records, then run morpheus context refresh.";
    }
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