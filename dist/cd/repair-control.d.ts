import type { CdState } from "./schema.js";
import type { Snapshot, Transaction } from "./store.js";
export declare const REPAIR_SCOPE_PREFIX = "repair:";
/** Only these transitions admit NEW repair work. Post-claim session, meter, checkpoint, error and
 * cleanup writes must pass through, or a hold would strand an invocation that already owns work. */
export declare const GUARDED_KINDS: readonly string[];
export declare class RepairHeld extends Error {
    readonly intentId: string;
    readonly code = "repair-held";
    constructor(intentId: string);
}
export declare class RepairControlInvalid extends Error {
    readonly code = "repair-control-invalid";
}
/** A refused operator request (exit 2). Distinct from an identical replay (exit 3). */
export declare class RepairControlRefused extends Error {
    readonly code = "repair-control-refused";
}
export type Hash = (value: unknown) => string;
export interface RepairHoldEntry {
    scope: `${typeof REPAIR_SCOPE_PREFIX}${string}`;
    actor: `operator:${string}`;
    reason: string;
    resumeCondition: string;
    createdAt: string;
    human: true;
}
export interface HoldRequest {
    schemaVersion: 1;
    operationId: string;
    intentId: string;
    expectedEpoch: string;
    observedHead: string;
    requestTransactionId: string;
    campaignRef: string;
    requestOperationId: string;
    actor: string;
    authorizationRef: string;
}
export interface ReleaseRequest {
    schemaVersion: 1;
    operationId: string;
    holdOperationId: string;
    intentId: string;
    expectedEpoch: string;
    observedHead: string;
    actor: string;
}
/** Stored as the transition result. The closed request is nested, never flattened: a top-level
 * campaignRef/kind would be read as a supplemental creation record by the consumer journal. */
export interface ControlResult {
    kind: "repair-control-hold" | "repair-control-release";
    entry: RepairHoldEntry;
    request: HoldRequest | ReleaseRequest;
    requestDigest: string;
}
export interface LedgerStore {
    read(): Promise<Snapshot>;
    transact<T>(id: string, kind: string, now: string, transition: (state: CdState) => T): Promise<Transaction<T>>;
}
export interface ControlOutcome {
    exit: 0 | 3;
    result: ControlResult;
    replayed: boolean;
}
/** Every `repair:` pause must be well formed; anything else fails closed for ALL new admissions. */
export declare function validateRepairControls(state: CdState): void;
export declare const repairHeld: (state: CdState, intentId: string) => boolean;
/** Pure CAS transition for a hold; re-run by the store on every reload. */
export declare function holdTransition(state: CdState, req: HoldRequest, now: string, hash: Hash): ControlResult;
/** Pure CAS transition for a release: only after the exact delivered receipt and with no live owner. */
export declare function releaseTransition(state: CdState, req: ReleaseRequest, hash: Hash): ControlResult;
export declare const applyHold: (store: LedgerStore, req: HoldRequest, now: string, hash: Hash) => Promise<ControlOutcome>;
export declare const applyRelease: (store: LedgerStore, req: ReleaseRequest, now: string, hash: Hash) => Promise<ControlOutcome>;
/** Wrap a store so only NEW-admission transitions see the control. `Object.create` keeps the original
 * receiver, its `api` and its (TypeScript-private, not #private) helpers; only `transact` is overridden. */
export declare function guardStore<S extends LedgerStore>(store: S, intentId: string): S;
