export const REPAIR_SCOPE_PREFIX = "repair:";
/** Only these transitions admit NEW repair work. Post-claim session, meter, checkpoint, error and
 * cleanup writes must pass through, or a hold would strand an invocation that already owns work. */
export const GUARDED_KINDS = ["agent-budget-wait", "claim-agent-invocation", "claim-hosted-agent-dispatch"];
export class RepairHeld extends Error {
    intentId;
    code = "repair-held";
    constructor(intentId) {
        super(`Repair is held for ${intentId}`);
        this.intentId = intentId;
    }
}
export class RepairControlInvalid extends Error {
    code = "repair-control-invalid";
}
/** A refused operator request (exit 2). Distinct from an identical replay (exit 3). */
export class RepairControlRefused extends Error {
    code = "repair-control-refused";
}
const OPERATION = /^[a-z0-9][a-z0-9-]{2,63}$/;
const ENTRY_KEYS = "actor,createdAt,human,reason,resumeCondition,scope";
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0 && !/[\r\n\0]/.test(value);
const refuse = (ok, message) => { if (!ok)
    throw new RepairControlRefused(message); };
/** Every `repair:` pause must be well formed; anything else fails closed for ALL new admissions. */
export function validateRepairControls(state) {
    const seen = new Set();
    for (const pause of state.pauses) {
        if (typeof pause.scope !== "string" || !pause.scope.startsWith(REPAIR_SCOPE_PREFIX))
            continue;
        const id = pause.scope.slice(REPAIR_SCOPE_PREFIX.length);
        const ok = Object.keys(pause).sort().join(",") === ENTRY_KEYS && state.intents[id]?.id === id && !seen.has(id) && pause.human === true
            && [pause.actor, pause.reason, pause.resumeCondition, pause.createdAt].every(nonEmpty) && pause.actor.startsWith("operator:")
            && !Number.isNaN(Date.parse(pause.createdAt));
        if (!ok)
            throw new RepairControlInvalid(`Malformed repair control ${JSON.stringify(pause.scope)}; new repair admission is refused`);
        seen.add(id);
    }
}
export const repairHeld = (state, intentId) => state.pauses.some(pause => pause.scope === REPAIR_SCOPE_PREFIX + intentId);
function holdWitness(state, req) {
    refuse(req.schemaVersion === 1 && OPERATION.test(req.operationId) && OPERATION.test(req.requestOperationId) && [req.actor, req.authorizationRef, req.campaignRef, req.requestTransactionId, req.observedHead].every(nonEmpty), "Malformed hold request");
    refuse(state.epoch === req.expectedEpoch, "Ledger epoch differs from the expected epoch");
    const intent = state.intents[req.intentId];
    refuse(intent && intent.id === req.intentId && intent.validation === true && intent.state !== "delivered", "Hold target must be an existing undelivered validation intent");
    const creation = state.transitions[req.requestTransactionId]?.result;
    refuse(creation?.kind === "supplemental-wake-probe" && creation.intentId === req.intentId && creation.campaignRef === req.campaignRef && creation.operationId === req.requestOperationId, "Hold must bind the exact closed supplemental creation request");
    refuse(intent.attempts.length === 0, "Hold must precede the first attempt");
    refuse(!Object.values(state.agents).some(work => work.intentId === req.intentId), "Target already has repair work or an owner");
    refuse(!repairHeld(state, req.intentId), "Target is already held");
}
/** Pure CAS transition for a hold; re-run by the store on every reload. */
export function holdTransition(state, req, now, hash) {
    validateRepairControls(state);
    holdWitness(state, req);
    const entry = { scope: `${REPAIR_SCOPE_PREFIX}${req.intentId}`, actor: `operator:${req.actor}`, reason: req.authorizationRef, resumeCondition: "exact delivered receipt and all target work complete", createdAt: now, human: true };
    state.pauses.push(entry);
    return { kind: "repair-control-hold", entry, request: req, requestDigest: hash(req) };
}
/** Pure CAS transition for a release: only after the exact delivered receipt and with no live owner. */
export function releaseTransition(state, req, hash) {
    refuse(req.schemaVersion === 1 && OPERATION.test(req.operationId) && OPERATION.test(req.holdOperationId) && [req.actor, req.observedHead].every(nonEmpty), "Malformed release request");
    refuse(state.epoch === req.expectedEpoch, "Ledger epoch differs from the expected epoch");
    const held = state.transitions[`repair-hold-${req.holdOperationId}`]?.result;
    refuse(held?.kind === "repair-control-hold" && held.entry.scope === REPAIR_SCOPE_PREFIX + req.intentId, "No matching hold transition");
    const matches = state.pauses.filter(pause => hash(pause) === hash(held.entry));
    refuse(matches.length === 1, "The exact hold entry is not present (already released or changed)");
    const intent = state.intents[req.intentId];
    refuse(intent?.state === "delivered" && intent.receipt?.intentId === intent.id, "Release requires the exact delivered receipt");
    const work = Object.values(state.agents).filter(item => item.intentId === req.intentId);
    refuse(work.every(item => item.state === "complete" && !item.lease && item.invocations.every(invocation => invocation.endedAt)), "Target repair work is not complete or still has an owner");
    state.pauses = state.pauses.filter(pause => hash(pause) !== hash(held.entry));
    return { kind: "repair-control-release", entry: held.entry, request: req, requestDigest: hash(req) };
}
async function commit(store, id, kind, req, now, hash, transition) {
    const tx = await store.transact(id, kind === "repair-control-hold" ? "operator-repair-hold" : "operator-repair-release", now, transition);
    // The store returns a replay WITHOUT running the callback, so the stored digest is checked here.
    refuse(tx.result?.kind === kind && tx.result.requestDigest === hash(req), "Operation id was already used for a different request");
    const fresh = (await store.read()).state, present = fresh.pauses.some(pause => hash(pause) === hash(tx.result.entry));
    // Readback after every commit and replay: an old hold retried after its release must refuse.
    refuse(kind === "repair-control-hold" ? present : !present, kind === "repair-control-hold" ? "Hold is not present at readback (released since)" : "Released hold is still present at readback");
    return { exit: tx.replayed ? 3 : 0, result: tx.result, replayed: tx.replayed };
}
export const applyHold = (store, req, now, hash) => commit(store, `repair-hold-${req.operationId}`, "repair-control-hold", req, now, hash, state => holdTransition(state, req, now, hash));
export const applyRelease = (store, req, now, hash) => commit(store, `repair-release-${req.operationId}`, "repair-control-release", req, now, hash, state => releaseTransition(state, req, hash));
/** Wrap a store so only NEW-admission transitions see the control. `Object.create` keeps the original
 * receiver, its `api` and its (TypeScript-private, not #private) helpers; only `transact` is overridden. */
export function guardStore(store, intentId) {
    const guarded = Object.create(store);
    Object.defineProperty(guarded, "transact", { value: (id, kind, now, transition) => store.transact(id, kind, now, state => {
            if (GUARDED_KINDS.includes(kind)) {
                validateRepairControls(state);
                if (repairHeld(state, intentId))
                    throw new RepairHeld(intentId);
            }
            return transition(state);
        }) });
    return guarded;
}
//# sourceMappingURL=repair-control.js.map