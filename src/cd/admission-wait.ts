// Pure ledger predicate shared by the worker and the worker-only entry. It imports no worker module, so the
// held-aware entry can apply it without binding a second runtime.
import type { AgentWork, CdState } from "./schema.js";

/** Next actions written when a worker refuses admission before claiming, so no model ran. */
export const SUBSCRIPTION_ADMISSION_WAITS: readonly string[] = Object.freeze(["wait-subscription-telemetry", "wait-measured-subscription-capacity", "wait-subscription-authentication"]);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when a subscription admission wait is the work's latest event: its schedule then reflects that
 * subscription's capacity, not the work, and another subscription may admit it now. Nothing may be running or
 * dispatched (the latest invocation has ended), and no invocation may have started or ended after the latest
 * admission-wait transition. In-run stops reuse the same next-action strings but write no admission-wait
 * transition, so they keep their ordinary poll schedule; an unreadable time is never due.
 */
export function awaitingSubscriptionAdmission(state: CdState, work: AgentWork): boolean {
  if (!SUBSCRIPTION_ADMISSION_WAITS.includes(state.intents[work.intentId]?.nextAction ?? "")) return false;
  const last = work.invocations.at(-1);
  // A live run or an uncertain hosted dispatch owns the work, however old its start.
  if (last && !last.endedAt) return false;
  const pattern = new RegExp(`^admission-wait-(?:claude-)?(?:telemetry|capacity|authentication)-${escape(work.id)}-[0-9]+$`);
  let latest = -Infinity;
  for (const [id, transition] of Object.entries(state.transitions)) if (pattern.test(id)) latest = Math.max(latest, Date.parse(transition.at));
  if (!Number.isFinite(latest)) return false;
  return !last || latest > Math.max(Date.parse(last.startedAt), Date.parse(last.endedAt ?? last.startedAt));
}
