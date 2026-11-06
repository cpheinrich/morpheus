import { postResumeAcceptanceSchema, budgetSpendingPolicySchema, hash, sourceAgeWaiverSchema, type CdState } from "./schema.js";
import { invariant, postResumeAcceptance, postResumeGroupKey } from "./state.js";

type Intent = CdState["intents"][string];
type Attempt = Intent["attempts"][number];
type PostResumeRecord = ReturnType<typeof postResumeAcceptanceSchema.parse>;

/** Runs before every commit, including transitions introduced by later controller versions. */
export function assertTransition(previous: CdState, next: CdState): void {
  invariant(next.epoch === previous.epoch && next.repository === previous.repository && next.schemaVersion === previous.schemaVersion, "Epoch/schema changes require an explicit lossless migration");
  for (const [id, record] of Object.entries(previous.transitions)) invariant(hash(next.transitions[id]) === hash(record), "Applied transition history cannot be removed or rewritten");
  for (const [id, old] of Object.entries(previous.intents)) assertIntentHistory(old, next.intents[id]);
  for (const [key, raw] of Object.entries(next.postResumeAcceptances ?? {})) assertPostResumeAcceptance(previous, next, key, raw);
  for (const key of Object.keys(previous.postResumeAcceptances ?? {})) invariant(next.postResumeAcceptances?.[key], "Post-resume journal cannot be removed");
  assertCursors(previous, next);
  assertExternalReviewHistory(previous, next);
  assertExternalReviewShape(next);
  for (const [key, before] of Object.entries(previous.builds)) {
    const after = next.builds[key]; invariant(after && BigInt(after.maximum) >= BigInt(before.maximum), "Build sequence cannot regress");
    for (const [id, reservation] of Object.entries(before.reservations)) invariant(hash(after.reservations[id]) === hash(reservation), "Build reservations remain burned forever");
  }
  assertBudget(previous, next);
  for (const intent of Object.values(next.intents)) assertIntentWellFormed(next, intent);
  for (const channel of ["staging", "production"] as const) invariant(Object.values(next.intents).filter(intent => intent.channel === channel && !intent.validation && intent.state !== "delivered").length <= 1, "Only one ordinary delivery per channel may be outstanding");
}

/** An existing delivery keeps its identity, clocks, append-only history and committed evidence. */
function assertIntentHistory(old: Intent, current: Intent | undefined): void {
  invariant(current, "Delivery obligations and receipts cannot be deleted");
  for (const key of ["id", "channel", "slot", "originalSource", "selectedMainEnteredAt", "validation", "isolatedValidation", "groupId", "createdAt"] as const) invariant(current[key] === old[key], `Original delivery ${key} is immutable`);
  invariant(current.postResumeKey === old.postResumeKey, "Post-resume origin association is immutable");
  invariant(hash(current.sourceAgeWaiver ?? null) === hash(old.sourceAgeWaiver ?? null), "Original source-age waiver is immutable");
  invariant(Date.parse(current.oldestDebtAt) <= Date.parse(old.oldestDebtAt) && Date.parse(current.deadlineAt) <= Date.parse(old.deadlineAt), "New work cannot reset the oldest debt or overdue clock");
  invariant(current.attempts.length >= old.attempts.length && current.lineage.length >= old.lineage.length, "Attempts and source lineage are append-only");
  invariant(hash(current.lineage.slice(0, old.lineage.length)) === hash(old.lineage), "Existing source lineage cannot be rewritten");
  if (old.receipt) invariant(current.state === "delivered" && hash(current.receipt) === hash(old.receipt), "The committed final receipt is immutable");
  if (old.external?.status === "available") invariant(hash(current.external) === hash(old.external), "Committed external availability evidence is immutable");
  if (old.external?.terminal) invariant(hash(current.external) === hash(old.external), "Terminal external evidence is immutable");
  for (let index = 0; index < old.attempts.length; index++) assertAttemptHistory(old.attempts[index]!, current.attempts[index]!);
}

function assertAttemptHistory(before: Attempt, after: Attempt): void {
  for (const key of ["id", "dispatchEffectId", "sourceSha", "controlSha", "appInputDigest", "configurationDigest", "appId", "version", "buildNumber", "lane", "createdAt"] as const) invariant(before[key] === after[key], `Attempt ${key} is immutable`);
  if (before.runId) invariant(before.runId === after.runId && before.runAttempt === after.runAttempt, "Bound workflow/run attempt cannot change");
  if (before.tests) invariant(hash(before.tests) === hash(after.tests), "Committed full-test evidence is immutable");
  if (before.upload) invariant(after.upload && before.upload.id === after.upload.id && hash(before.upload.identity) === hash(after.upload.identity) && (!before.upload.acceptedAt || before.upload.acceptedAt === after.upload.acceptedAt), "Upload claims/identity/acceptance cannot be erased or reused");
}

function assertPostResumeAcceptance(previous: CdState, next: CdState, key: string, raw: unknown): void {
  const record = postResumeAcceptanceSchema.parse(raw), intent = next.intents[record.intentId];
  invariant(intent && intent.postResumeKey === key && intent.validation && !intent.isolatedValidation && intent.attempts.length <= 1, "Post-resume journal requires its unique uncounted validation intent");
  postResumeAcceptance(next, intent);
  const old = previous.postResumeAcceptances?.[key];
  if (!old) invariant(!previous.intents[record.intentId], "Existing intents cannot be enrolled as post-resume acceptance");
  else assertPostResumeHistory(old, record);
  for (const attempt of intent.attempts) assertPostResumeAttempt(next, intent, record, attempt);
  for (const [id, group] of Object.entries(record.groups)) invariant(id === postResumeGroupKey(record, group.attemptId, group.groupId, group.buildId) && intent.groupId === group.groupId && intent.attempts.some(attempt => attempt.id === group.attemptId && attempt.observation?.buildId === group.buildId && attempt.upload?.acceptedAt), "Optional group key/accepted build differs");
}

function assertPostResumeHistory(old: PostResumeRecord, record: PostResumeRecord): void {
  invariant(hash(record.origin) === hash(old.origin) && record.intentId === old.intentId && record.qualifications.length >= old.qualifications.length && hash(record.qualifications.slice(0, old.qualifications.length)) === hash(old.qualifications), "Post-resume origin and qualifications are append-only");
  if (old.yielded) invariant(hash(record.yielded) === hash(old.yielded), "Post-resume yield cannot be erased or rewritten");
  for (const [id, release] of Object.entries(old.releases)) invariant(hash(record.releases[id]) === hash(release), "Execution release cannot be erased or rewritten");
  for (const [id, group] of Object.entries(old.groups)) {
    const after = record.groups[id];
    invariant(after && after.attemptId === group.attemptId && after.groupId === group.groupId && after.buildId === group.buildId && after.claimedAt === group.claimedAt && (!group.observedAt || after.observedAt === group.observedAt), "Optional group claim is immutable");
  }
}

function assertPostResumeAttempt(next: CdState, intent: Intent, record: PostResumeRecord, attempt: Attempt): void {
  const release = record.releases[attempt.id];
  if (release) invariant(releaseStillBinds(next, intent, attempt, release), "Released executor authority cannot be changed or revived");
  if (record.yielded?.attemptId === attempt.id) invariant(attempt.dispatch.state === "intended" && !attempt.dispatch.sentAt && !attempt.runId && !attempt.runAttempt && !attempt.tests && !attempt.upload && !Object.keys(next.transitions).some(id => id.startsWith(`dispatch-call-${attempt.id}-`)), "Yielded attempt cannot acquire effect authority");
  if (attempt.upload && !attempt.upload.acceptedAt && (attempt.upload.outcome !== "rejected" || !release)) invariant(attempt.status === "active", "Unreleased optional upload must remain the same active execution");
}

function releaseStillBinds(next: CdState, intent: Intent, attempt: Attempt, release: PostResumeRecord["releases"][string]): unknown {
  return release.identityDigest === hash({ schemaVersion: 1, intentId: intent.id, attemptId: attempt.id, dispatchEffectId: attempt.dispatchEffectId, sourceSha: attempt.sourceSha, controlSha: attempt.controlSha, runId: attempt.runId, runAttempt: attempt.runAttempt })
    && attempt.quiescence && hash(attempt.quiescence) === release.quiescenceDigest
    && attempt.lease?.owner === release.leaseOwner && attempt.lease.fence === release.fence && next.fences[attempt.id] === release.fence
    && attempt.workflowTerminalAt;
}

function assertCursors(previous: CdState, next: CdState): void {
  for (const [channel, old] of Object.entries(previous.cursors)) invariant(next.cursors[channel as "staging" | "production"]!.order >= old!.order, "Ordinary delivery cursors cannot regress");
  for (const [group, old] of Object.entries(previous.groupCursors ?? {})) invariant(next.groupCursors?.[group] && next.groupCursors[group]!.order >= old.order, "Internal group cursors cannot regress");
}

function assertExternalReviewHistory(previous: CdState, next: CdState): void {
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
}

function assertExternalReviewShape(next: CdState): void {
  for (const [key, review] of Object.entries(next.externalReviews ?? {})) {
    invariant(key === hash({ appId: review.appId, buildId: review.buildId }) && review.attempts.length > 0, "External review operation must retain its exact app/build key and claims");
    for (const attempt of review.attempts) invariant(Number.isFinite(Date.parse(attempt.claimedAt)) && (attempt.outcome === "claimed" || attempt.completedAt && Number.isFinite(Date.parse(attempt.completedAt))), "External review operation needs measured claim/completion times");
  }
}

function assertBudget(previous: CdState, next: CdState): void {
  if (next.budget.spendingPolicy !== undefined) budgetSpendingPolicySchema.parse(next.budget.spendingPolicy);
  const before = previous.budget.spendingPolicy;
  if (before) {
    invariant(next.budget.spendingPolicy?.campaignId === before.campaignId, "Campaign spending policy cannot be removed or reassigned");
    const after = next.budget.spendingPolicy;
    if (after.capMicros !== before.capMicros)
      invariant(after.authorizationRef !== before.authorizationRef, "Changed budget cap requires a new human authorization reference");
    if (after.capMicros === before.capMicros && after.authorizationRef === before.authorizationRef)
      invariant(hash(after) === hash(before), "Unchanged spending policy must retain its adoption record");
  }
  invariant(next.budget.spentMicros >= previous.budget.spentMicros, "Settled spend cannot decrease");
  for (const [id, reserved] of Object.entries(previous.budget.reservations)) {
    const after = next.budget.reservations[id]; invariant(after && after.digest === reserved.digest && after.maximumMicros === reserved.maximumMicros, "Paid request liability/identity cannot be discarded");
    if (reserved.status === "settled") invariant(hash(after) === hash(reserved), "Paid settlement tombstones are immutable");
  }
}

/** Every delivery in the next state, old or new, satisfies its standing shape rules. */
function assertIntentWellFormed(next: CdState, intent: Intent): void {
  if (intent.postResumeKey) postResumeAcceptance(next, intent);
  invariant(!intent.sourceAgeWaiver || intent.validation, "Source-age waiver requires a validation intent");
  if (intent.sourceAgeWaiver) sourceAgeWaiverSchema.parse(intent.sourceAgeWaiver);
  invariant(Number.isFinite(Date.parse(intent.nextCheckAt)) && Number.isFinite(Date.parse(intent.deadlineAt)), "Every delivery needs an explicit next check and original deadline");
  if (intent.state === "repairing") invariant(Object.values(next.agents).some(work => work.intentId === intent.id && work.state !== "complete"), "Repairing state must atomically own durable agent work");
  if (intent.state === "delivered") invariant(intent.receipt, "Delivery requires its exact immutable receipt");
  assertExternalFollowUp(intent);
}

function assertExternalFollowUp(intent: Intent): void {
  if (!intent.external) return;
  invariant(intent.state === "delivered" && intent.receipt && !intent.isolatedValidation && Number.isFinite(Date.parse(intent.external.nextCheckAt)), "External follow-up requires its delivered receipt and explicit next check");
  const observation = intent.external.observation, receipt = intent.receipt.observation;
  if (observation) invariant(observation.appId === receipt.appId && observation.version === receipt.version && observation.buildNumber === receipt.buildNumber && observation.buildId === receipt.buildId, "External evidence cannot substitute a sibling internal receipt build");
}
