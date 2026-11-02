import type { AgentWork, CdState } from "./schema.js";
/** Next actions written when a worker refuses admission before claiming, so no model ran. */
export declare const SUBSCRIPTION_ADMISSION_WAITS: readonly string[];
/**
 * True when a subscription admission wait is the work's latest event: its schedule then reflects that
 * subscription's capacity, not the work, and another subscription may admit it now. Nothing may be running or
 * dispatched (the latest invocation has ended), and no invocation may have started or ended after the latest
 * admission-wait transition. In-run stops reuse the same next-action strings but write no admission-wait
 * transition, so they keep their ordinary poll schedule; an unreadable time is never due.
 */
export declare function awaitingSubscriptionAdmission(state: CdState, work: AgentWork): boolean;
