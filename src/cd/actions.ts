import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { type Attempt, type CdConfig, type TestEvidence, type UploadEvidence } from "./schema.js";
import { invariant } from "./state.js";
import { isMissing, pages, type GitHubApi } from "./store.js";
import { validatePayloadFiles } from "./evidence.js";

const exec = promisify(execFile);
export interface WorkflowRun { id: number; run_attempt: number; status: string; conclusion: string | null; display_title: string; head_sha: string; event: string; path: string; created_at: string; updated_at: string }
export function matchesEffect(title: string, effect: string): boolean { return new RegExp(`(?:^|[^A-Za-z0-9_.-])${effect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_.-])`).test(title); }
export class ActionsAdapter {
  constructor(readonly api: GitHubApi, readonly config: CdConfig) {}
  async runs(effectId: string, workflow = this.config.deliveryWorkflow): Promise<WorkflowRun[]> {
    const runs = await pages<WorkflowRun>(this.api, `repos/${this.config.repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`, "workflow_runs");
    return runs.filter(run => matchesEffect(run.display_title, effectId));
  }
  async run(id: string): Promise<WorkflowRun> { return this.api.request("GET", `repos/${this.config.repository}/actions/runs/${id}`); }
  async runAttempt(id: string, attempt: string): Promise<WorkflowRun> { return this.api.request("GET", `repos/${this.config.repository}/actions/runs/${id}/attempts/${attempt}`); }
  async executionRef(controlSha: string): Promise<string> {
    invariant(/^[a-f0-9]{40}$/.test(controlSha), "Execution control requires an exact SHA");
    const tag = `morpheus-cd-control-${controlSha}`, path = `repos/${this.config.repository}/git/ref/tags/${tag}`;
    type Ref = { object: { type: string; sha: string } };
    let ref: Ref;
    try { ref = await this.api.request<Ref>("GET", path); }
    catch (error) {
      if (!isMissing(error)) throw error;
      let creationError: unknown;
      try { await this.api.request("POST", `repos/${this.config.repository}/git/refs`, { ref: `refs/tags/${tag}`, sha: controlSha }); }
      catch (error) { creationError = error; } // Concurrent create/lost ack still needs readback.
      try { ref = await this.api.request<Ref>("GET", path); }
      catch (error) { throw creationError ?? error; }
    }
    invariant(ref.object.type === "commit" && ref.object.sha === controlSha, "Owned execution tag differs from immutable control SHA; never overwrite it");
    return tag;
  }
  async dispatch(attempt: Attempt, intentId: string, channel: string): Promise<void> {
    const ref = await this.executionRef(attempt.controlSha);
    await this.api.request("POST", `repos/${this.config.repository}/actions/workflows/${encodeURIComponent(this.config.deliveryWorkflow)}/dispatches`, { ref, inputs: { "intent-id": intentId, "attempt-id": attempt.id, "dispatch-effect-id": attempt.dispatchEffectId, "source-sha": attempt.sourceSha, "control-sha": attempt.controlSha, channel, "runner-lane": attempt.lane, "reserved-build-number": attempt.buildNumber, "app-input-digest": attempt.appInputDigest, "configuration-digest": attempt.configurationDigest } });
  }
  async cancel(id: string): Promise<void> { await this.api.request("POST", `repos/${this.config.repository}/actions/runs/${id}/cancel`); }
  verifyRun(run: WorkflowRun, attempt: Attempt): void {
    invariant(run.head_sha === attempt.controlSha && run.event === "workflow_dispatch" && run.path.split("@")[0] === `.github/workflows/${this.config.deliveryWorkflow}` && matchesEffect(run.display_title, attempt.dispatchEffectId), "Workflow run is not the trusted exact control/effect execution");
    invariant(!attempt.runAttempt || attempt.runAttempt === String(run.run_attempt), "Workflow rerun cannot reuse an upload attempt");
  }
  async evidence(run: WorkflowRun, attempt: Attempt): Promise<{ tests: TestEvidence[]; uploads: UploadEvidence[]; failures: unknown[] }> {
    this.verifyRun(run, attempt);
    const artifacts = await pages<{ id: number; name: string; expired: boolean }>(this.api, `repos/${this.config.repository}/actions/runs/${run.id}/artifacts`, "artifacts");
    const found: { tests: TestEvidence[]; uploads: UploadEvidence[]; failures: unknown[] } = { tests: [], uploads: [], failures: [] };
    const relevant = artifacts.filter(artifact => !artifact.expired && (artifact.name.startsWith("cd-v2-") || artifact.name.includes(attempt.dispatchEffectId) || artifact.name.startsWith("testflight-upload-") || artifact.name.startsWith("ios-upload-acceptance-")));
    for (const artifact of relevant) {
      const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-artifact-"));
      try {
        await exec("gh", ["run", "download", String(run.id), "--repo", this.config.repository, "--name", artifact.name, "--dir", directory], { timeout: 120_000, maxBuffer: 1_048_576 });
        const entries = await readdir(directory, { recursive: true, withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
          const path = join(entry.parentPath, entry.name), bytes = await readFile(path), sha256 = createHash("sha256").update(bytes).digest("hex");
          let evidence: Record<string, unknown>; try { evidence = JSON.parse(bytes.toString("utf8")); } catch { continue; }
          if (evidence.intentId !== undefined) invariant(evidence.intentId === attempt.id.replace(/-a[0-9]+$/, "") && evidence.attemptId === attempt.id && evidence.dispatchEffectId === attempt.dispatchEffectId && evidence.sourceSha === attempt.sourceSha && evidence.controlSha === attempt.controlSha && String(evidence.runId) === String(run.id) && String(evidence.runAttempt) === String(run.run_attempt), "Artifact substitutes sibling source/control/run identity");
          if (evidence.scope === "full" && evidence.inventory && evidence.results) { await validatePayloadFiles(evidence as unknown as TestEvidence, path); found.tests.push(evidence as unknown as TestEvidence); }
          else if ((evidence.uploadId || evidence.providerUploadId || evidence.outcome) && evidence.ipaSha256) found.uploads.push(uploadEvidence(evidence));
          else if (evidence.kind === "failure" && evidence.intentId) found.failures.push({ ...evidence, artifact: { id: String(artifact.id), name: artifact.name, sha256 } });
        }
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
    return found;
  }
}
export function uploadEvidence(raw: Record<string, unknown>): UploadEvidence {
  const state = String(raw.state ?? raw.outcome ?? "uncertain");
  const outcome = state === "accepted" ? "accepted" : ["FAILED", "INVALID", "rejected"].includes(state) ? "rejected" : "uncertain";
  return { ...raw, runId: String(raw.runId), runAttempt: String(raw.runAttempt), buildNumber: String(raw.buildNumber), outcome, providerUploadId: raw.providerUploadId ?? raw.uploadId, diagnostics: raw.diagnostics ?? (Array.isArray(raw.diagnosticCodes) ? raw.diagnosticCodes.join(", ") : undefined) } as UploadEvidence;
}
