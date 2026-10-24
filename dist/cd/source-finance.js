import { z } from "zod";
import { configSchema, configurationDigest, digest, hash } from "./schema.js";
import { invariant } from "./state.js";
import { GitHubStore } from "./store.js";
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]+$/).min(1).max(160);
const micros = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const utcMillis = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, "Expected canonical UTC milliseconds");
const grantSchema = z.object({
    version: z.literal(1), kind: z.literal("reviewed-source-financial-authority"),
    grantId: identifier, humanEvidenceSha256: digest,
    repository: configSchema.shape.repository, epoch: identifier, configurationDigest: digest,
    reservationId: z.string().regex(/^source-ci-[A-Za-z0-9_.:-]+$/).max(160), requestDigest: digest,
    maximumMicros: micros.positive(), totalCeilingMicros: micros.positive(),
    purpose: z.literal("source-ci-publication"), issuedAt: utcMillis, expiresAt: utcMillis,
}).strict();
const requestSchema = z.object({
    version: z.literal(1), kind: z.literal("source-ci-publication"),
    repository: configSchema.shape.repository, taskId: identifier,
    branch: z.string().regex(/^[A-Za-z0-9_./-]+$/).min(1).max(240),
    fullCiMax: micros, metadataCiMax: micros, gitBranchPreviewsMax: micros, productionDeploymentsMax: micros,
    budgetTransactionsMax: z.literal(1), nativeEffects: z.literal(false),
    paidModelFallback: z.literal(false), previewSettingsEffects: z.literal(false),
}).strict();
function freeze(value) {
    if (value !== null && typeof value === "object") {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
export function prepareReviewedSourceReservation(config, input) {
    // Parsing copies the entire JSON contract before the first asynchronous store read.
    const snapshot = freeze({ config: configSchema.parse(config), grant: grantSchema.parse(input.grant), request: requestSchema.parse(input.request), approvedGrantDigest: digest.parse(input.approvedGrantDigest), reservationId: input.reservationId, maximumMicros: micros.positive().parse(input.maximumMicros) });
    invariant(hash(snapshot.grant) === snapshot.approvedGrantDigest, "Reviewed source grant digest mismatch");
    invariant(snapshot.grant.reservationId === snapshot.reservationId && snapshot.grant.maximumMicros === snapshot.maximumMicros, "Reviewed source reservation id or amount differs from grant");
    invariant(snapshot.maximumMicros <= snapshot.grant.totalCeilingMicros, "Reviewed source amount exceeds its ceiling");
    invariant(hash(snapshot.request) === snapshot.grant.requestDigest, "Reviewed source request digest mismatch");
    const envelope = freeze({ version: 1, kind: "reviewed-source-reservation", request: snapshot.request, authority: { grant: snapshot.grant, digest: snapshot.approvedGrantDigest } });
    const receipt = freeze({ version: 1, kind: "reviewed-source-reservation-receipt", id: snapshot.reservationId, maximumMicros: snapshot.maximumMicros, requestDigest: hash(envelope), envelope });
    return freeze({ ...snapshot, receipt, transitionId: `budget-reserve-${snapshot.reservationId}` });
}
function bindings(state, input) {
    invariant(input.grant.repository === input.config.repository && input.grant.repository === input.request.repository && input.grant.repository === state.repository, "Reviewed source repository mismatch");
    invariant(input.grant.epoch === state.epoch, "Reviewed source epoch mismatch");
    invariant(input.grant.configurationDigest === state.configurationDigest && input.grant.configurationDigest === configurationDigest(input.config), "Reviewed source supplied/stored configuration mismatch");
}
function readback(state, input) {
    bindings(state, input);
    const paid = state.budget.reservations[input.reservationId];
    invariant(hash(paid) === hash({ digest: input.receipt.requestDigest, maximumMicros: input.maximumMicros, status: "reserved" }), "Reviewed source paid reservation is missing, changed or settled");
    const transition = state.transitions[input.transitionId];
    invariant(z.uuid().safeParse(transition?.owner).success && hash(transition?.result) === hash(input.receipt), "Reviewed source complete authority receipt mismatch");
}
function admission(state, input, now) {
    bindings(state, input);
    const issued = Date.parse(input.grant.issuedAt), expires = Date.parse(input.grant.expiresAt), current = Date.parse(now);
    invariant(expires > issued && expires - issued <= 30 * 60_000 && issued <= current && current < expires, "Reviewed source grant is outside its admission window");
    invariant(state.budget && state.budget.reservations && !Array.isArray(state.budget.reservations), "Reviewed source ledger reservations are invalid");
    micros.parse(state.budget.spentMicros);
    let liability = state.budget.spentMicros;
    for (const paid of Object.values(state.budget.reservations)) {
        digest.parse(paid.digest);
        micros.parse(paid.maximumMicros);
        invariant(paid.status === "reserved" || paid.status === "settled", "Reviewed source ledger reservation status is invalid");
        if (paid.status === "settled")
            invariant(micros.safeParse(paid.actualMicros).success && paid.actualMicros <= paid.maximumMicros, "Reviewed source settlement tombstone is invalid");
        else {
            invariant(paid.actualMicros === undefined, "Reviewed source reserved liability has a settlement");
            liability += paid.maximumMicros;
            invariant(Number.isSafeInteger(liability), "Reviewed source liability overflow");
        }
    }
    const existing = state.budget.reservations[input.reservationId];
    // A paid object alone cannot be adopted into this authority protocol.
    if (existing)
        readback(state, input);
    else
        invariant(!state.transitions[input.transitionId], "Reviewed source transition has no reserved paid object");
    const total = liability + (existing ? 0 : input.maximumMicros);
    invariant(Number.isSafeInteger(total) && total <= input.grant.totalCeilingMicros, "Reviewed source financial ceiling exhausted or overflowed");
}
/** Pure CAS callback seam; an observation time is data, never a CLI clock override. */
export function applyReviewedSourceReservation(state, prepared, observedAt) {
    admission(state, prepared, utcMillis.parse(observedAt));
    if (!state.budget.reservations[prepared.reservationId])
        state.budget.reservations[prepared.reservationId] = { digest: prepared.receipt.requestDigest, maximumMicros: prepared.maximumMicros, status: "reserved" };
    return prepared.receipt;
}
/** The hash pins an operator-reviewed input; it is not a human signature or a credential. */
export async function reserveReviewedSource(api, config, input) {
    const prepared = prepareReviewedSourceReservation(config, input), store = new GitHubStore(api, prepared.config);
    // transact returns an existing transition without invoking its callback.
    admission((await store.read()).state, prepared, new Date().toISOString());
    const transaction = await store.transact(prepared.transitionId, "reserve-paid-request", new Date().toISOString(), state => applyReviewedSourceReservation(state, prepared, new Date().toISOString()));
    const final = await store.read();
    readback(final.state, prepared);
    invariant(hash(transaction.result) === hash(prepared.receipt), "Reviewed source transaction receipt mismatch");
    if (transaction.replayed)
        admission(final.state, prepared, new Date().toISOString());
    return { ...transaction, verifiedReadbackHead: final.head };
}
//# sourceMappingURL=source-finance.js.map