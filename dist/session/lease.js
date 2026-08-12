/**
 * The records CLAUDE.md tells every session to load before doing anything. A
 * receipt that does not cover all of them is not a receipt for this project,
 * whatever else it lists.
 */
export const CANONICAL_INPUTS = [
    "CLAUDE.md",
    ".agent/decisions.md",
    ".agent/learned.md",
];
/**
 * A lease is an observation with a term. Past it the observation is a
 * historical fact rather than a statement about now, which is the whole
 * difference between a lease and a receipt.
 */
export const LEASE_TTL_MS = 5 * 60 * 1000;
/**
 * Fingerprint sentinels: the two ways a record can have no content.
 *
 * They live here rather than beside `readInputs` because their *meaning* is
 * policy. **Neither is a value, so neither is compared** — `localDelta` treats
 * a sentinel on a required record as the absence of information, never as
 * information that happens to match. Comparing them by equality is what made
 * *I could not read it* match *I could not read it*, and — the wider case —
 * made three missing records in the wrong tree certify `fresh`.
 */
export const ABSENT = "absent";
/**
 * The record exists but yields no content: a permission change, a dangling
 * symlink (`CLAUDE.md` is a symlink in this repo), a directory where a file
 * was. Distinguished from `ABSENT` because it is **unclearable** — re-reading
 * is what the lease asks for and re-reading cannot change the answer — so a
 * lease reports it separately rather than as ordinary drift.
 */
export const UNREADABLE = "unreadable";
/**
 * The one message an agent actually reads, so the two instructions in it must
 * not contradict. `unresolvableInputs` is a *subset* of `changedInputs`, and
 * naming the same record in both halves opened by telling the agent to refresh
 * what the next clause said refreshing would not fix.
 */
export class ContextFreshnessError extends Error {
    lease;
    constructor(lease) {
        const stuck = lease.unresolvableInputs ?? [];
        const refresh = (lease.changedInputs ?? []).filter((id) => !stuck.includes(id));
        const parts = [`Context is ${lease.status}.`];
        if (refresh.length)
            parts.push(`Refresh these inputs: ${refresh.join(", ")}.`);
        else if (!stuck.length)
            parts.push("Refresh context before continuing.");
        if (lease.reason)
            parts.push(lease.reason);
        super(parts.join(" "));
        this.lease = lease;
    }
}
/**
 * Everything the receipt alone can settle. Knowable offline, so it is
 * reported even when the remote could not be reached — an agent that cannot
 * verify GitHub can still be told which records it never read.
 *
 * Driven by `required`, not by what the observation happened to report. The
 * two lists are supplied independently by the caller, so iterating the
 * observation would let a project declare a fourth canonical record, build
 * its receipt with it, observe without it, and get `fresh` while that record
 * changed underneath. Completeness has to be the policy's property, not a
 * convention at the call site.
 */
function localDelta(receipt, observation, required) {
    const covered = new Map(receipt.inputs.map((input) => [input.id, input.fingerprint]));
    const observed = new Map(observation.inputs.map((input) => [input.id, input.fingerprint]));
    const isRequired = new Set(required);
    const changed = [];
    const unresolvable = [];
    // One predicate over the union, so the sentinel rule cannot stop at the edge
    // of the required set. A record the receipt covered voluntarily gets the same
    // treatment as one the project declared.
    for (const id of [...new Set([...required, ...covered.keys()])].sort()) {
        const read = covered.get(id);
        const now = observed.get(id);
        const mustHave = isRequired.has(id);
        // What a refresh cannot fix — judged on the *observation*, because that is
        // what re-reading would produce again. A required record with no content
        // now, or one the observer never reported, comes back identical however
        // many times the runner retries.
        if (now === UNREADABLE || (mustHave && (now === undefined || now === ABSENT))) {
            changed.push(id);
            unresolvable.push(id);
            continue;
        }
        if (mustHave) {
            // The record is readable now; the *receipt* is what lacks content. That
            // is ordinary drift — taking a fresh receipt clears it.
            if (read === undefined || read === ABSENT || read === UNREADABLE) {
                changed.push(id);
                continue;
            }
        }
        else if (read === undefined || now === undefined) {
            // Outside the required set the receipt is best-effort: an id the
            // observation did not report is not something the policy can speak to.
            // A project that needs it verified declares it required.
            continue;
        }
        else if (read === UNREADABLE) {
            changed.push(id);
            continue;
        }
        if (read !== now)
            changed.push(id);
    }
    return { changed, unresolvable };
}
/** Pure policy function, so CI needs neither GitHub nor an AI provider. */
export function observeLease(receipt, observation, policy = {}) {
    const { changed: changedInputs, unresolvable } = localDelta(receipt, observation, policy.requiredInputs ?? CANONICAL_INPUTS);
    // Reported separately because refreshing cannot clear it. Folded into
    // `changedInputs`, a record that re-reading cannot fix is indistinguishable
    // from one another agent edited, and the runner loops on a refresh that can
    // never succeed.
    const unresolvableInputs = unresolvable.length ? { unresolvableInputs: unresolvable } : {};
    const cannotRead = unresolvable.length
        ? ` Repair first: ${unresolvable.join(", ")} — re-reading will not clear this.`
        : "";
    if (observation.remoteSha === null) {
        return {
            version: 1,
            receipt,
            checkedAt: observation.checkedAt,
            status: "unknown",
            changedInputs,
            ...unresolvableInputs,
            reason: `Could not verify remote context.${cannotRead}`,
        };
    }
    const remoteAdvanced = observation.remoteSha !== receipt.remoteSha;
    if (changedInputs.length > 0 || remoteAdvanced) {
        return {
            version: 1,
            receipt,
            checkedAt: observation.checkedAt,
            status: "refresh_required",
            changedInputs,
            ...unresolvableInputs,
            ...(remoteAdvanced ? { remoteAdvanced: true } : {}),
            // Both clauses, not the first that applies. `changedInputs` is local
            // records by construction, so a ternary meant an agent whose
            // `decisions.md` moved *and* whose trunk advanced was told to re-read
            // three files and never told to look at what merged — different
            // actions, and the same one-of-two-outputs miss the lease field fixed
            // for the adapter.
            reason: [
                changedInputs.length > 0 ? "Canonical project inputs are unread or changed." : "",
                remoteAdvanced ? "Remote state advanced; determine the canonical delta before continuing." : "",
            ]
                .filter(Boolean)
                .join(" ") + cannotRead,
        };
    }
    return {
        version: 1,
        receipt,
        checkedAt: observation.checkedAt,
        status: "fresh",
        changedInputs: [],
    };
}
/**
 * Re-read a lease as of `now`. An expired lease — or one whose `checkedAt`
 * cannot be parsed, or sits in the future because a clock moved — degrades to
 * `refresh_required` rather than carrying its old verdict forward.
 */
export function leaseAt(lease, now = new Date(), policy = {}) {
    if (lease.status !== "fresh")
        return lease;
    const ttlMs = policy.ttlMs ?? LEASE_TTL_MS;
    const age = now.getTime() - Date.parse(lease.checkedAt);
    if (Number.isFinite(age) && age >= 0 && age < ttlMs)
        return lease;
    let reason;
    if (!Number.isFinite(age))
        reason = "Lease has no readable check time.";
    else if (age < 0)
        reason = "Lease was checked in the future; the clock moved.";
    else
        reason = `Lease was checked ${Math.round(age / 1000)}s ago; the term is ${ttlMs / 1000}s.`;
    return { ...lease, status: "refresh_required", reason };
}
/**
 * Fail closed at a durable or externally governed boundary. `now` defaults to
 * the real clock so a caller cannot skip the term check by omitting it.
 */
export function requireFresh(lease, now = new Date(), policy = {}) {
    const current = leaseAt(lease, now, policy);
    if (current.status !== "fresh")
        throw new ContextFreshnessError(current);
}
//# sourceMappingURL=lease.js.map