import { hash, sourceAgeWaiverSchema, type CdState } from "./schema.js";
import { invariant } from "./state.js";

/** Runs before every commit, including transitions introduced by later controller versions. */
export function assertTransition(previous: CdState, next: CdState): void {
  invariant(next.epoch === previous.epoch && next.repository === previous.repository && next.schemaVersion === previous.schemaVersion, "Epoch/schema changes require an explicit lossless migration");
  for (const [id, record] of Object.entries(previous.transitions)) invariant(hash(next.transitions[id]) === hash(record), "Applied transition history cannot be removed or rewritten");
  for (const [id, old] of Object.entries(previous.intents)) {
    const current = next.intents[id]; invariant(current, "Delivery obligations and receipts cannot be deleted");
    for (const key of ["id", "channel", "slot", "originalSource", "selectedMainEnteredAt", "validation", "isolatedValidation", "groupId", "createdAt"] as const) invariant(current[key] === old[key], `Original delivery ${key} is immutable`);
    invariant(hash(current.sourceAgeWaiver ?? null) === hash(old.sourceAgeWaiver ?? null), "Original source-age waiver is immutable");
    invariant(Date.parse(current.oldestDebtAt) <= Date.parse(old.oldestDebtAt) && Date.parse(current.deadlineAt) <= Date.parse(old.deadlineAt), "New work cannot reset the oldest debt or overdue clock");
    invariant(current.attempts.length >= old.attempts.length && current.lineage.length >= old.lineage.length, "Attempts and source lineage are append-only");
    invariant(hash(current.lineage.slice(0, old.lineage.length)) === hash(old.lineage), "Existing source lineage cannot be rewritten");
    if (old.receipt) invariant(current.state === "delivered" && hash(current.receipt) === hash(old.receipt), "The committed final receipt is immutable");
    if (old.external?.status === "available") invariant(hash(current.external) === hash(old.external), "Committed external availability evidence is immutable");
    if (old.external?.terminal) invariant(hash(current.external) === hash(old.external), "Terminal external evidence is immutable");
    for (let index = 0; index < old.attempts.length; index++) {
      const before = old.attempts[index]!, after = current.attempts[index]!;
      for (const key of ["id", "dispatchEffectId", "sourceSha", "controlSha", "appInputDigest", "configurationDigest", "appId", "version", "buildNumber", "lane", "createdAt"] as const) invariant(before[key] === after[key], `Attempt ${key} is immutable`);
      if (before.runId) invariant(before.runId === after.runId && before.runAttempt === after.runAttempt, "Bound workflow/run attempt cannot change");
      if (before.tests) invariant(hash(before.tests) === hash(after.tests), "Committed full-test evidence is immutable");
      if (before.upload) invariant(after.upload && before.upload.id === after.upload.id && hash(before.upload.identity) === hash(after.upload.identity) && (!before.upload.acceptedAt || before.upload.acceptedAt === after.upload.acceptedAt), "Upload claims/identity/acceptance cannot be erased or reused");
    }
  }
  for (const [channel, old] of Object.entries(previous.cursors)) invariant(next.cursors[channel as "staging" | "production"]!.order >= old!.order, "Ordinary delivery cursors cannot regress");
  for (const [group, old] of Object.entries(previous.groupCursors ?? {})) invariant(next.groupCursors?.[group] && next.groupCursors[group]!.order >= old.order, "Internal group cursors cannot regress");
  for (const [key, old] of Object.entries(previous.externalReviews ?? {})) {
    const current = next.externalReviews?.[key];
    invariant(current && current.appId === old.appId && current.buildId === old.buildId && current.attempts.length >= old.attempts.length, "External review claims and exact build binding cannot be deleted or rewritten");
    for (let index = 0; index < old.attempts.length; index++) {
      const before = old.attempts[index]!, after = current.attempts[index]!;
      invariant(after.claimedAt === before.claimedAt, "External review claim time is immutable");
      if (before.outcome !== "claimed") invariant(hash(after) === hash(before), "Completed external review operation is immutable");
      if (before.submissionId) invariant(after.submissionId === before.submissionId, "Exact external submission identity is immutable");
    }
  }
  for (const [key, review] of Object.entries(next.externalReviews ?? {})) {
    invariant(key === hash({ appId: review.appId, buildId: review.buildId }) && review.attempts.length > 0, "External review operation must retain its exact app/build key and claims");
    for (const attempt of review.attempts) invariant(Number.isFinite(Date.parse(attempt.claimedAt)) && (attempt.outcome === "claimed" || attempt.completedAt && Number.isFinite(Date.parse(attempt.completedAt))), "External review operation needs measured claim/completion times");
  }
  for (const [key, before] of Object.entries(previous.builds)) {
    const after = next.builds[key]; invariant(after && BigInt(after.maximum) >= BigInt(before.maximum), "Build sequence cannot regress");
    for (const [id, reservation] of Object.entries(before.reservations)) invariant(hash(after.reservations[id]) === hash(reservation), "Build reservations remain burned forever");
  }
  invariant(next.budget.spentMicros >= previous.budget.spentMicros, "Settled spend cannot decrease");
  for (const [id, before] of Object.entries(previous.budget.reservations)) {
    const after = next.budget.reservations[id]; invariant(after && after.digest === before.digest && after.maximumMicros === before.maximumMicros, "Paid request liability/identity cannot be discarded");
    if (before.status === "settled") invariant(hash(after) === hash(before), "Paid settlement tombstones are immutable");
  }
  for (const intent of Object.values(next.intents)) {
    invariant(!intent.sourceAgeWaiver || intent.validation, "Source-age waiver requires a validation intent");
    if (intent.sourceAgeWaiver) sourceAgeWaiverSchema.parse(intent.sourceAgeWaiver);
    invariant(Number.isFinite(Date.parse(intent.nextCheckAt)) && Number.isFinite(Date.parse(intent.deadlineAt)), "Every delivery needs an explicit next check and original deadline");
    if (intent.state === "repairing") invariant(Object.values(next.agents).some(work => work.intentId === intent.id && work.state !== "complete"), "Repairing state must atomically own durable agent work");
    if (intent.state === "delivered") invariant(intent.receipt, "Delivery requires its exact immutable receipt");
    if (intent.external) {
      invariant(intent.state === "delivered" && intent.receipt && !intent.isolatedValidation && Number.isFinite(Date.parse(intent.external.nextCheckAt)), "External follow-up requires its delivered receipt and explicit next check");
      const observation = intent.external.observation, receipt = intent.receipt.observation;
      if (observation) invariant(observation.appId === receipt.appId && observation.version === receipt.version && observation.buildNumber === receipt.buildNumber && observation.buildId === receipt.buildId, "External evidence cannot substitute a sibling internal receipt build");
    }
  }
  for (const channel of ["staging", "production"] as const) invariant(Object.values(next.intents).filter(intent => intent.channel === channel && !intent.validation && intent.state !== "delivered").length <= 1, "Only one ordinary delivery per channel may be outstanding");
}
