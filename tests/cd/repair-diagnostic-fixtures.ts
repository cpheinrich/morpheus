import { hash } from "../../src/cd/schema.js";
import { type RepairDiagnostic } from "../../src/cd/repair-diagnostic.js";
import { claimUpload, recordUpload, repairWork } from "../../src/cd/state.js";
import { config, now, prepared } from "./fixtures.js";

export function diagnosticFixture() {
  const fixture = prepared(), { state, intentId, upload } = fixture;
  claimUpload(state, config(), upload, now); recordUpload(state, { ...upload, outcome: "rejected", diagnostics: "synthetic rejected upload" }, now);
  const previous = Object.values(state.agents)[0]!; previous.state = "complete";
  const workId = repairWork(state, intentId, ["synthetic failed attempt"], now), work = state.agents[workId]!;
  work.state = "running"; work.lease = { owner: "existing-owner", expiresAt: now, fence: 9 };
  work.invocations = [{ id: "existing-invocation", executor: "local", hostId: "synthetic-host", startedAt: now, session: "existing-session" }];
  state.fences[workId] = 9; state.pauses.push({ scope: "unrelated", actor: "synthetic", reason: "preserve", resumeCondition: "normal owner", createdAt: now, human: true });
  state.budget.reservations.existing = { digest: hash("existing"), maximumMicros: 19, status: "reserved" };
  const { appId: _appId, version: _version, buildNumber: _buildNumber, ipaSha256: _ipaSha256, ...identity } = upload;
  const input: RepairDiagnostic = { ...identity, kind: "repair-diagnostic", workId, taskDigest: work.taskDigest, diagnostic: { summary: "Corrected capability was separately qualified", evidence: ["synthetic-proof:reviewed-source"] } };
  return { ...fixture, workId, input };
}
