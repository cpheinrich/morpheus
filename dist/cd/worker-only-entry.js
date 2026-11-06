import { RepairControlInvalid, RepairHeld, guardStore, repairHeld, validateRepairControls } from "./repair-control.js";
import { awaitingSubscriptionAdmission } from "./admission-wait.js";
/** The worker's own first-due predicate (not complete, due, lease absent or expired). */
export const due = (work, now) => work.state !== "complete" && Date.parse(work.nextCheckAt) <= Date.parse(now) && (!work.lease || Date.parse(work.lease.expiresAt) <= Date.parse(now));
/** The first due work that is not held, or the result to return: idle when nothing is due, held when all of it is. */
function selectUnheld(state, executor, now) {
    // The Claude executor applies the worker's own rule: a latest-event subscription admission wait is due for it.
    const claudeDue = (work) => executor === "claude" && work.state !== "complete"
        && (!work.lease || Date.parse(work.lease.expiresAt) <= Date.parse(now)) && awaitingSubscriptionAdmission(state, work);
    const candidates = Object.values(state.agents).filter(work => due(work, now) || claudeDue(work));
    if (!candidates.length)
        return { result: { state: "idle" } };
    const work = candidates.find(item => !repairHeld(state, item.intentId));
    return work ? { work } : { result: { state: "repair-held", workId: candidates[0].id } };
}
export async function runHeldAwareWorker(d) {
    const snapshot = await d.store.read(), now = (d.now ?? (() => new Date().toISOString()))();
    try {
        validateRepairControls(snapshot.state);
    }
    catch (error) {
        if (error instanceof RepairControlInvalid)
            return { state: "repair-control-invalid", reason: error.message };
        throw error;
    }
    let target = d.options.workId ? snapshot.state.agents[d.options.workId] : undefined;
    // A held target returns before quota/login; unheld work behind it is still selected (no starvation).
    if (target && repairHeld(snapshot.state, target.intentId))
        return { state: "repair-held", workId: target.id };
    if (!d.options.workId) {
        const selected = selectUnheld(snapshot.state, d.options.executor, now);
        if (!selected.work)
            return selected.result;
        target = selected.work;
    }
    // With no holds this is the work the unchanged worker would pick itself. The explicit workId adds
    // one bounded early race (documented): a concurrent budget-wait between the two reads.
    const options = target ? { ...d.options, workId: target.id } : d.options;
    try {
        return await d.runWorker(d.config, target ? guardStore(d.store, target.intentId) : d.store, d.sourceDir, options, d.environment);
    }
    catch (error) {
        return controlRefusal(error, target?.id ?? d.options.workId ?? "");
    }
}
/** A hold or invalid control raised while the worker ran is a result, not a failure; anything else propagates. */
function controlRefusal(error, workId) {
    if (error instanceof RepairHeld)
        return { state: "repair-held", workId };
    if (error instanceof RepairControlInvalid)
        return { state: "repair-control-invalid", reason: error.message };
    throw error;
}
//# sourceMappingURL=worker-only-entry.js.map