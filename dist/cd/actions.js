import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { invariant } from "./state.js";
import { boundedGitHubReadApi, isMissing, pages } from "./store.js";
import { validatePayloadFiles } from "./evidence.js";
const exec = promisify(execFile);
export function matchesEffect(title, effect) { return new RegExp(`(?:^|[^A-Za-z0-9_.-])${effect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_.-])`).test(title); }
export class ActionsAdapter {
    api;
    config;
    constructor(api, config) {
        this.api = api;
        this.config = config;
    }
    async runs(effectId, workflow = this.config.deliveryWorkflow, limits) {
        const api = limits ? boundedGitHubReadApi(this.api, limits) : this.api;
        const runs = await pages(api, `repos/${this.config.repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`, "workflow_runs");
        return runs.filter(run => matchesEffect(run.display_title, effectId));
    }
    async run(id) { return this.api.request("GET", `repos/${this.config.repository}/actions/runs/${id}`); }
    async runAttempt(id, attempt, limits) { return (limits ? boundedGitHubReadApi(this.api, limits) : this.api).request("GET", `repos/${this.config.repository}/actions/runs/${id}/attempts/${attempt}`); }
    async executionRef(controlSha) {
        invariant(/^[a-f0-9]{40}$/.test(controlSha), "Execution control requires an exact SHA");
        const tag = `morpheus-cd-control-${controlSha}`, path = `repos/${this.config.repository}/git/ref/tags/${tag}`;
        let ref;
        try {
            ref = await this.api.request("GET", path);
        }
        catch (error) {
            if (!isMissing(error))
                throw error;
            let creationError;
            try {
                await this.api.request("POST", `repos/${this.config.repository}/git/refs`, { ref: `refs/tags/${tag}`, sha: controlSha });
            }
            catch (error) {
                creationError = error;
            } // Concurrent create/lost ack still needs readback.
            try {
                ref = await this.api.request("GET", path);
            }
            catch (error) {
                throw creationError ?? error;
            }
        }
        invariant(ref.object.type === "commit" && ref.object.sha === controlSha, "Owned execution tag differs from immutable control SHA; never overwrite it");
        return tag;
    }
    async dispatch(attempt, intentId, channel) {
        const ref = await this.executionRef(attempt.controlSha);
        await this.api.request("POST", `repos/${this.config.repository}/actions/workflows/${encodeURIComponent(this.config.deliveryWorkflow)}/dispatches`, { ref, inputs: { "intent-id": intentId, "attempt-id": attempt.id, "dispatch-effect-id": attempt.dispatchEffectId, "source-sha": attempt.sourceSha, "control-sha": attempt.controlSha, channel, "runner-lane": attempt.lane, "reserved-build-number": attempt.buildNumber, "app-input-digest": attempt.appInputDigest, "configuration-digest": attempt.configurationDigest } });
    }
    async cancel(id) { await this.api.request("POST", `repos/${this.config.repository}/actions/runs/${id}/cancel`); }
    verifyRun(run, attempt) {
        invariant(run.head_sha === attempt.controlSha && run.event === "workflow_dispatch" && run.path.split("@")[0] === `.github/workflows/${this.config.deliveryWorkflow}` && matchesEffect(run.display_title, attempt.dispatchEffectId), "Workflow run is not the trusted exact control/effect execution");
        invariant(!attempt.runAttempt || attempt.runAttempt === String(run.run_attempt), "Workflow rerun cannot reuse an upload attempt");
    }
    async evidence(run, attempt, limits) {
        this.verifyRun(run, attempt);
        const signal = limits ? AbortSignal.timeout(limits.timeoutMs) : undefined, api = limits ? boundedGitHubReadApi(this.api, limits, signal) : this.api;
        const artifacts = await pages(api, `repos/${this.config.repository}/actions/runs/${run.id}/artifacts`, "artifacts");
        const found = { tests: [], uploads: [], failures: [] };
        const relevant = artifacts.filter(artifact => !artifact.expired && (artifact.name.startsWith("cd-v2-") || artifact.name.includes(attempt.dispatchEffectId) || artifact.name.startsWith("testflight-upload-") || artifact.name.startsWith("ios-upload-acceptance-")));
        invariant(!limits || relevant.length <= 4, "Optional artifact census exceeds four downloads; outcome is unknown");
        for (const artifact of relevant) {
            invariant(!signal?.aborted, "Optional artifact evidence deadline reached; outcome is unknown");
            const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-artifact-"));
            try {
                await exec("gh", ["run", "download", String(run.id), "--repo", this.config.repository, "--name", artifact.name, "--dir", directory], { timeout: limits?.timeoutMs ?? 120_000, maxBuffer: 1_048_576, ...(signal ? { signal } : {}) });
                const entries = await readdir(directory, { recursive: true, withFileTypes: true });
                for (const entry of entries) {
                    invariant(!signal?.aborted, "Optional artifact evidence deadline reached; outcome is unknown");
                    if (!entry.isFile() || !entry.name.endsWith(".json"))
                        continue;
                    const path = join(entry.parentPath, entry.name), bytes = await readFile(path, signal ? { signal } : undefined), sha256 = createHash("sha256").update(bytes).digest("hex");
                    let evidence;
                    try {
                        evidence = JSON.parse(bytes.toString("utf8"));
                    }
                    catch {
                        continue;
                    }
                    if (evidence.intentId !== undefined)
                        invariant(evidence.intentId === attempt.id.replace(/-a[0-9]+$/, "") && evidence.attemptId === attempt.id && evidence.dispatchEffectId === attempt.dispatchEffectId && evidence.sourceSha === attempt.sourceSha && evidence.controlSha === attempt.controlSha && String(evidence.runId) === String(run.id) && String(evidence.runAttempt) === String(run.run_attempt), "Artifact substitutes sibling source/control/run identity");
                    if (evidence.scope === "full" && evidence.inventory && evidence.results) {
                        await validatePayloadFiles(evidence, path);
                        found.tests.push(evidence);
                    }
                    else if ((evidence.uploadId || evidence.providerUploadId || evidence.outcome) && evidence.ipaSha256)
                        found.uploads.push(uploadEvidence(evidence));
                    else if (evidence.kind === "failure" && evidence.intentId)
                        found.failures.push({ ...evidence, artifact: { id: String(artifact.id), name: artifact.name, sha256 } });
                }
            }
            finally {
                await rm(directory, { recursive: true, force: true });
            }
        }
        invariant(!signal?.aborted, "Optional artifact evidence deadline reached; outcome is unknown");
        return found;
    }
}
export function uploadEvidence(raw) {
    const state = String(raw.state ?? raw.outcome ?? "uncertain");
    const outcome = state === "accepted" ? "accepted" : ["FAILED", "INVALID", "rejected"].includes(state) ? "rejected" : "uncertain";
    return { ...raw, runId: String(raw.runId), runAttempt: String(raw.runAttempt), buildNumber: String(raw.buildNumber), outcome, providerUploadId: raw.providerUploadId ?? raw.uploadId, diagnostics: raw.diagnostics ?? (Array.isArray(raw.diagnosticCodes) ? raw.diagnosticCodes.join(", ") : undefined) };
}
//# sourceMappingURL=actions.js.map