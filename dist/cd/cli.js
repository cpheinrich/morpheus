import { parseArgs } from "node:util";
import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { budgetSpendingPolicySchema, configSchema, configurationDigest, hash } from "./schema.js";
import { GhApi, GitHubStore } from "./store.js";
import { ActionsAdapter, uploadEvidence } from "./actions.js";
import { AppleAdapter, AppleHttp } from "./apple.js";
import { Controller, status } from "./controller.js";
import { checkIdentity, claimUpload, createIntent, invariant, recordTests, recordUpload, repairWork, sourceAt, budgetStatus, setBudgetSpendingPolicy, reservePaid, settlePaid } from "./state.js";
import { verifyConfiguration, verifySource, verifyValidator } from "./source.js";
import { runWorker, scheduleHosted, QuotaReader } from "./worker.js";
import { githubToken, probeGitHubToken } from "./github-token.js";
import { validatePayloadFiles } from "./evidence.js";
import { reserveReviewedSource } from "./source-finance.js";
import { recordRepairDiagnostic, REPAIR_DIAGNOSTIC_MAX_BYTES } from "./repair-diagnostic.js";
const HELP = `morpheus cd config|init|tick|request|status|verify-execution|claim-upload|record-upload|upload-hook|record|worker|budget
  --config PATH                 Consumer configuration (default .morpheus/cd.json)
  --source-dir PATH             Exact app checkout, separate from trusted control/config
  tick [--observe]               Reconcile slots, workflows, Apple and durable repairs
  request --channel CHANNEL [--source SHA] [--validation] [--group ID] [--source-age-waiver REF]
  record --kind tests|failure|quiescence --evidence FILE (or - for stdin)
  record --kind repair-diagnostic --evidence FILE  Bounded data for an existing failed repair
  upload-hook --phase before|resource|after
  worker --executor local|hosted [--host-id ID] [--work-id ID --invocation-id ID --task-digest SHA256]
  budget --operation spend-as-needed --campaign ID --cap-micros N --authorization-ref REF
  budget --operation reserve|settle --id ID [--request FILE --maximum-micros N|--actual-micros N]
    reserve [--authority FILE --authority-digest SHA256]  Explicit reviewed source CI grant
All results are JSON. Upload claim exit 3 means skip safely; never retry bytes.
`;
async function jsonInput(path) {
    if (path !== "-")
        return JSON.parse(await readFile(resolve(path), "utf8"));
    let text = "";
    for await (const bytes of process.stdin)
        text += String(bytes);
    return JSON.parse(text);
}
async function repairDiagnosticInput(path) {
    invariant(path !== "-", "Repair diagnostics require a bounded JSON file");
    const file = await open(resolve(path), constants.O_RDONLY | constants.O_NONBLOCK);
    try {
        const stat = await file.stat();
        invariant(stat.isFile() && stat.size > 0 && stat.size <= REPAIR_DIAGNOSTIC_MAX_BYTES, "Repair diagnostic file must contain 1..16384 bytes");
        const bytes = Buffer.alloc(REPAIR_DIAGNOSTIC_MAX_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
            const read = await file.read(bytes, length, bytes.length - length, null);
            if (!read.bytesRead)
                break;
            length += read.bytesRead;
        }
        invariant(length <= REPAIR_DIAGNOSTIC_MAX_BYTES, "Repair diagnostic file exceeds 16384 bytes");
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
    }
    finally {
        await file.close();
    }
}
function required(value, name) { invariant(value, `Missing ${name}`); return value; }
export function environmentIdentity(environment) {
    const value = (name) => required(environment[name], name);
    return { schemaVersion: 1, intentId: value("MORPHEUS_CD_INTENT_ID"), attemptId: value("MORPHEUS_CD_ATTEMPT_ID"), dispatchEffectId: value("MORPHEUS_CD_DISPATCH_EFFECT_ID"), sourceSha: value("MORPHEUS_CD_SOURCE_SHA"), controlSha: value("MORPHEUS_CD_CONTROL_SHA"), runId: value("GITHUB_RUN_ID"), runAttempt: value("GITHUB_RUN_ATTEMPT") };
}
export async function verifyExecution(config, store, actions, sourceDir, identity, environment) {
    const snapshot = await store.read(), { intent, attempt } = checkIdentity(snapshot.state, identity);
    verifyConfiguration(config, attempt.configurationDigest);
    verifySource(sourceDir, config, attempt.sourceSha, attempt.appInputDigest);
    invariant(!environment.MORPHEUS_CD_APP_INPUT_DIGEST || environment.MORPHEUS_CD_APP_INPUT_DIGEST === attempt.appInputDigest, "Dispatch input digest mismatch");
    invariant(!environment.MORPHEUS_CD_CONFIGURATION_DIGEST || environment.MORPHEUS_CD_CONFIGURATION_DIGEST === attempt.configurationDigest, "Dispatch configuration digest mismatch");
    const run = await actions.run(identity.runId);
    actions.verifyRun(run, attempt);
    invariant(String(run.run_attempt) === identity.runAttempt, "Execution run attempt differs from GitHub");
    invariant(!snapshot.state.pauses.some(pause => ["all", intent.channel, intent.id].includes(pause.scope)), "Delivery is paused");
    await store.transact(`verify-${attempt.id}-${identity.runId}-${identity.runAttempt}`, "verify-execution", new Date().toISOString(), state => { checkIdentity(state, identity); return { runId: identity.runId }; });
    return { authorized: true, intentId: intent.id, attemptId: attempt.id, channel: intent.channel, sourceSha: attempt.sourceSha, controlSha: attempt.controlSha, appInputDigest: attempt.appInputDigest, configurationDigest: attempt.configurationDigest, buildNumber: attempt.buildNumber, app: config.channels[intent.channel] };
}
async function uploadGroupPreflight(config, store, identity, environment) {
    const { intent, attempt } = checkIdentity((await store.read()).state, identity);
    const group = await new AppleAdapter(new AppleHttp(config, environment)).group(intent.groupId);
    invariant(group.id === intent.groupId && group.appId === attempt.appId && group.internal && !group.automaticDistribution && group.testerIds.length > 0, "Upload requires the configured internal group, actual members, and disabled automatic all-build distribution");
}
/** Separate parsing preserves every CD-owned flag without changing the established global grammar. */
export async function cd(argv, environment = process.env) {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
            config: { type: "string" }, "source-dir": { type: "string" }, evidence: { type: "string" }, kind: { type: "string" }, phase: { type: "string" },
            channel: { type: "string" }, source: { type: "string" }, group: { type: "string" }, validation: { type: "boolean" }, observe: { type: "boolean" },
            "source-age-waiver": { type: "string" },
            executor: { type: "string" }, "host-id": { type: "string" }, "work-id": { type: "string" }, "invocation-id": { type: "string" }, "task-digest": { type: "string" },
            operation: { type: "string" }, id: { type: "string" }, request: { type: "string" }, "maximum-micros": { type: "string" }, "actual-micros": { type: "string" },
            campaign: { type: "string" }, "cap-micros": { type: "string" }, "authorization-ref": { type: "string" },
            authority: { type: "string" }, "authority-digest": { type: "string" },
            help: { type: "boolean", short: "h" }, json: { type: "boolean" }, revoke: { type: "boolean" }, probe: { type: "boolean" },
        } });
    const sourceAuthority = values.authority !== undefined || values["authority-digest"] !== undefined;
    if (sourceAuthority) {
        invariant(values.authority && values["authority-digest"], "Reviewed source authority requires both --authority and --authority-digest");
        invariant(positionals.length === 1 && positionals[0] === "budget" && values.operation === "reserve" && !values.help, "Reviewed source authority is only valid for explicit budget reserve, without help");
        const allowed = new Set(["config", "operation", "id", "request", "maximum-micros", "authority", "authority-digest", "json"]);
        for (const key of Object.keys(values))
            invariant(allowed.has(key), `Reviewed source budget reserve does not accept --${key}`);
    }
    const spendingPolicy = values.campaign !== undefined || values["cap-micros"] !== undefined || values["authorization-ref"] !== undefined || values.operation === "spend-as-needed";
    if (spendingPolicy) {
        invariant(positionals.length === 1 && positionals[0] === "budget" && values.operation === "spend-as-needed" && !sourceAuthority && !values.help, "Spending policy flags are only valid for explicit budget spend-as-needed");
        const allowed = new Set(["config", "operation", "campaign", "cap-micros", "authorization-ref", "json"]);
        for (const key of Object.keys(values))
            invariant(allowed.has(key), `Spending policy does not accept --${key}`);
    }
    if (values.kind === "repair-diagnostic") {
        invariant(positionals.length === 1 && positionals[0] === "record" && !values.help, "Repair diagnostics require the explicit record command without help");
        const allowed = new Set(["config", "kind", "evidence", "json"]);
        for (const key of Object.keys(values))
            invariant(allowed.has(key), `Repair diagnostic record does not accept --${key}`);
    }
    if (values.help || !positionals.length) {
        console.log(HELP);
        return 0;
    }
    if (positionals[0] === "github-token") {
        console.log(JSON.stringify(await (values.probe ? probeGitHubToken(environment) : githubToken(environment, values.revoke))));
        return 0;
    }
    const configPath = resolve(values.config ?? ".morpheus/cd.json"), config = configSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
    const sourceDir = resolve(values["source-dir"] ?? environment.MORPHEUS_CD_SOURCE_DIR ?? (basename(dirname(configPath)) === ".morpheus" ? dirname(dirname(configPath)) : dirname(configPath)));
    const api = new GhApi(), store = new GitHubStore(api, config), actions = new ActionsAdapter(api, config), now = new Date().toISOString();
    let result;
    switch (positionals[0]) {
        case "config":
            result = { valid: true, configurationDigest: configurationDigest(config), config };
            break;
        case "quota": {
            invariant(values.executor === "local" || values.executor === "hosted", "Quota probe requires --executor local|hosted");
            result = await new QuotaReader(config, values.executor, sourceDir, environment).read(now);
            break;
        }
        case "init":
            result = await store.initialize(now);
            break;
        case "status": {
            const snapshot = await store.read();
            result = { head: snapshot.head, epoch: snapshot.state.epoch, mode: config.mode, intents: status(snapshot.state, now), slots: snapshot.state.slots, agents: snapshot.state.agents, budget: snapshot.state.budget, budgetStatus: budgetStatus(snapshot.state, config), pauses: snapshot.state.pauses };
            break;
        }
        case "tick": {
            result = await new Controller(config, store, actions, new AppleAdapter(new AppleHttp(config, environment)), sourceDir).tick(now, values.observe);
            if (config.mode === "active" && !values.observe)
                await scheduleHosted(config, store, now);
            break;
        }
        case "request": {
            invariant(values.channel === "staging" || values.channel === "production", "Request requires staging or production channel");
            invariant(values["source-age-waiver"] === undefined || values.validation && values.source, "Source-age waiver requires --validation and explicit --source SHA");
            const channel = values.channel;
            result = await store.transact(`request-${randomUUID()}`, "manual-delivery-request", now, state => {
                const selected = values.source ? sourceAt(state, values.source) : state.sources.filter(source => channel === "staging" || Date.parse(source.mainEnteredAt) + config.channels.production.minimumAgeHours * 3_600_000 <= Date.parse(now)).at(-1);
                invariant(selected, "No source with verified main-entry evidence is eligible");
                invariant(values.validation || !Object.values(state.intents).some(intent => intent.channel === channel && !intent.validation && intent.state !== "delivered"), "Ordinary channel intent is already outstanding");
                const id = `${channel}-${values.validation ? "validation" : "request"}-${randomUUID()}`;
                const waiver = values["source-age-waiver"] === undefined ? undefined : { authorizationRef: values["source-age-waiver"], grantedAt: now };
                return { intentId: createIntent(state, config, channel, selected, now, now, values.validation, values.group, id, waiver).id };
            });
            break;
        }
        case "verify-execution":
            result = await verifyExecution(config, store, actions, sourceDir, environmentIdentity(environment), environment);
            break;
        case "claim-upload": {
            invariant(config.mode === "active", "Observe mode cannot authorize uploads");
            const evidence = await jsonInput(required(values.evidence, "--evidence"));
            await verifyExecution(config, store, actions, sourceDir, evidence, environment);
            await uploadGroupPreflight(config, store, evidence, environment);
            try {
                const claim = await store.transact(`upload-claim-${evidence.attemptId}`, "claim-upload", now, state => ({ uploadOperationId: claimUpload(state, config, evidence, state.intents[evidence.intentId]?.postResumeKey ? new Date().toISOString() : now) }));
                console.log(JSON.stringify({ authorized: !claim.replayed, ...claim.result, reason: claim.replayed ? "already-claimed-reconcile-existing-operation" : "new-upload-claim" }));
                return claim.replayed ? 3 : 0;
            }
            catch (error) {
                if (/Upload already claimed|no longer current|Sibling workflow|rerun cannot reuse/.test(String(error))) {
                    console.log(JSON.stringify({ authorized: false, reason: String(error) }));
                    return 3;
                }
                throw error;
            }
        }
        case "record-upload": {
            const evidence = uploadEvidence(await jsonInput(required(values.evidence, "--evidence")));
            result = await store.transact(`upload-record-${evidence.attemptId}-${hash(evidence).slice(0, 24)}`, "record-upload-result", now, state => { recordUpload(state, evidence, now); return { uploadOperationId: `upload:${evidence.attemptId}`, outcome: evidence.outcome, providerUploadId: evidence.providerUploadId }; });
            break;
        }
        case "upload-hook": {
            const identity = environmentIdentity(environment), phase = required(values.phase, "--phase");
            const common = { ...identity, appId: required(environment.ASC_APP_ID, "ASC_APP_ID"), version: required(environment.MARKETING_VERSION, "MARKETING_VERSION"), buildNumber: required(environment.BUILD_NUMBER, "BUILD_NUMBER"), ipaSha256: required(environment.IPA_SHA256, "IPA_SHA256") };
            if (phase === "before") {
                invariant(config.mode === "active", "Observe mode cannot authorize uploads");
                try {
                    await verifyExecution(config, store, actions, sourceDir, identity, environment);
                    await uploadGroupPreflight(config, store, identity, environment);
                    const claim = await store.transact(`upload-claim-${identity.attemptId}`, "claim-upload", now, state => ({ uploadOperationId: claimUpload(state, config, common, state.intents[identity.intentId]?.postResumeKey ? new Date().toISOString() : now) }));
                    console.log(JSON.stringify({ authorized: !claim.replayed, ...claim.result }));
                    return claim.replayed ? 3 : 0;
                }
                catch (error) {
                    if (/already claimed|no longer current|Sibling workflow|rerun cannot reuse/.test(String(error))) {
                        console.log(JSON.stringify({ authorized: false, reason: String(error) }));
                        return 3;
                    }
                    throw error;
                }
            }
            invariant(phase === "resource" || phase === "after", "Upload hook phase must be before, resource or after");
            const raw = await jsonInput(required(environment.UPLOAD_RECEIPT_PATH, "UPLOAD_RECEIPT_PATH"));
            for (const [key, value] of Object.entries(common))
                invariant(raw[key] === undefined || String(raw[key]) === String(value), `Upload hook ${key} mismatch`);
            const evidence = uploadEvidence({ ...common, ...raw });
            if (phase === "after")
                invariant(evidence.outcome === "accepted" || evidence.outcome === "rejected", "After hook needs explicit accepted/rejected provider receipt");
            result = await store.transact(`upload-record-${identity.attemptId}-${hash(evidence).slice(0, 24)}`, "record-upload-result", now, state => { recordUpload(state, evidence, now); return { uploadOperationId: `upload:${identity.attemptId}`, outcome: evidence.outcome, providerUploadId: evidence.providerUploadId }; });
            break;
        }
        case "record": {
            const path = required(values.evidence, "--evidence");
            if (values.kind === "repair-diagnostic") {
                result = await recordRepairDiagnostic(store, await repairDiagnosticInput(path));
                break;
            }
            const evidence = await jsonInput(path);
            if (values.kind === "tests") {
                invariant(path !== "-", "Full-test evidence needs a file and its actual sibling payloads");
                const tests = evidence;
                await validatePayloadFiles(tests, path);
                verifyValidator(sourceDir, tests);
                await verifyExecution(config, store, actions, sourceDir, tests, environment);
                result = await store.transact(`tests-${tests.attemptId}-${hash(tests).slice(0, 24)}`, "record-full-tests", now, state => { recordTests(state, config, tests); return { attemptId: tests.attemptId, testEvidenceHash: hash(tests) }; });
            }
            else if (values.kind === "failure") {
                result = await store.transact(`failure-evidence-${evidence.attemptId}-${hash(evidence).slice(0, 16)}`, "record-failure", now, state => { const { intent } = checkIdentity(state, evidence); return { workId: repairWork(state, intent.id, [JSON.stringify(evidence)], now) }; });
            }
            else if (values.kind === "quiescence") {
                result = await store.transact(`quiescence-${evidence.attemptId}`, "record-executor-quiescence", now, state => {
                    const { attempt } = checkIdentity(state, evidence);
                    invariant(evidence.kind === "host-terminated" || evidence.kind === "hosted-terminated", "Quiescence needs executor/VM termination evidence");
                    invariant(typeof evidence.ref === "string" && evidence.ref.length > 10 && evidence.processGroupAbsent === true && evidence.executorTerminated === true, "Job terminal status/lease expiry alone cannot establish quiescence");
                    attempt.quiescence = { kind: evidence.kind, ref: evidence.ref, observedAt: now };
                    return attempt.quiescence;
                });
            }
            else
                throw new Error("Record kind must be tests, failure, quiescence or repair-diagnostic");
            break;
        }
        case "worker": {
            invariant(values.executor === undefined || values.executor === "local" || values.executor === "hosted", "Unknown agent executor");
            result = await runWorker(config, store, sourceDir, { executor: values.executor ?? "local", hostId: values["host-id"], workId: values["work-id"], invocationId: values["invocation-id"], taskDigest: values["task-digest"] }, environment);
            break;
        }
        case "budget": {
            if (values.operation === "spend-as-needed") {
                const input = { campaignId: required(values.campaign, "--campaign"), capMicros: Number(required(values["cap-micros"], "--cap-micros")), authorizationRef: required(values["authorization-ref"], "--authorization-ref") };
                // Validate before reading or writing the ledger; the transaction rechecks its live identity.
                const policy = budgetSpendingPolicySchema.parse({ mode: "spend-as-needed", ...input, adoptedAt: now });
                const transaction = await store.transact(`budget-policy-${hash(input)}`, "budget-spend-as-needed", now, state => setBudgetSpendingPolicy(state, config, input, now));
                result = transaction;
                const final = (await store.read()).state;
                invariant(final.configurationDigest === configurationDigest(config), "Budget policy configuration differs from ledger");
                const current = final.budget.spendingPolicy;
                invariant(hash(current) === hash(transaction.result) && current?.campaignId === policy.campaignId && current.capMicros === policy.capMicros && current.authorizationRef === policy.authorizationRef, "Spending policy replay differs from current policy");
                break;
            }
            const id = required(values.id, "--id");
            if (values.operation === "reserve") {
                if (sourceAuthority) {
                    const requestPath = required(values.request, "--request"), maximum = Number(required(values["maximum-micros"], "--maximum-micros"));
                    invariant(requestPath !== "-" && values.authority !== "-", "Reviewed source grant and request require JSON files");
                    const request = await jsonInput(requestPath);
                    result = await reserveReviewedSource(api, config, { grant: await jsonInput(values.authority), approvedGrantDigest: values["authority-digest"], request, reservationId: id, maximumMicros: maximum });
                }
                else {
                    const request = await jsonInput(required(values.request, "--request")), maximum = Number(required(values["maximum-micros"], "--maximum-micros"));
                    result = await store.transact(`budget-reserve-${id}`, "reserve-paid-request", now, state => { reservePaid(state, config, id, request, maximum); return { id, maximumMicros: maximum }; });
                    const reserved = (await store.read()).state.budget.reservations[id];
                    invariant(reserved?.digest === hash(request) && reserved.maximumMicros === maximum && reserved.status === "reserved", "Paid request reservation was replayed with changed or settled identity");
                }
            }
            else if (values.operation === "settle") {
                const actual = Number(required(values["actual-micros"], "--actual-micros"));
                result = await store.transact(`budget-settle-${id}`, "settle-paid-request", now, state => { settlePaid(state, id, actual); return { id, actualMicros: actual }; });
                invariant((await store.read()).state.budget.reservations[id]?.actualMicros === actual, "Paid settlement replay differs from immutable tombstone");
            }
            else
                throw new Error("Budget operation must be reserve or settle");
            break;
        }
        default: throw new Error(`Unknown CD command ${positionals[0]}`);
    }
    console.log(JSON.stringify(result));
    return 0;
}
//# sourceMappingURL=cli.js.map