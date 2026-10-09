import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Decision, planDecision, planNoDecision, planRoute } from "../gh-manager/decision.js";
import { renderDigest } from "../gh-manager/digest.js";
import { evidenceUrl, hasPlaceholder, prepareEvidence, substituteEvidence } from "../gh-manager/evidence.js";
import { assertRepository, execute, publishEvidence, fetchLiveState, fetchOpenPullRequests, fetchPolicy, postDigest } from "../gh-manager/github.js";
import { GH_MANAGER_POLICY_PATH, GhManagerPolicy } from "../gh-manager/policy.js";
import { OVERLAY_PATH, sessionPrompt } from "../gh-manager/prompt.js";
import { SAFE_REF, sweep } from "../gh-manager/sweep.js";
import { managerRecordProblem, sessionPushed } from "../gh-manager/verify.js";
import { execFileSync } from "node:child_process";
function write(path, text) {
    if (!path) {
        console.log(text);
        return;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
}
function output(name, value) {
    const file = process.env["GITHUB_OUTPUT"];
    if (file)
        appendFileSync(file, `${name}=${value}\n`);
}
function runUrl() {
    const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: run } = process.env;
    return server && repository && run ? `${server}/${repository}/actions/runs/${run}` : "a local run";
}
function readSweep(path) {
    if (!path)
        throw new Error("a sweep file is required");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { ...raw, policy: GhManagerPolicy.parse(raw.policy) };
}
function describe(plan) {
    return plan.operations.map(op => op.kind === "add-label" || op.kind === "remove-label" ? `${op.kind} ${op.label}` : op.kind === "rerun" ? `rerun ${op.runIds.length} cancelled run(s)` : op.kind);
}
function firstLine(error) {
    const stderr = error.stderr;
    return (stderr ? stderr.toString() : error instanceof Error ? error.message : String(error)).trim().split("\n")[0] ?? "unknown error";
}
/**
 * Carry a plan out, stopping at the first failure so a half-applied plan is reported as one.
 *
 * The plan's comment comes first and carries the marker, so a failure further on has already
 * been counted as an attempt. That comment says what was *about* to happen, so a failure is
 * followed by a second comment saying what did not: the audit trail must not claim an
 * auto-merge that was refused.
 */
function carryOut(repo, number, plan, dryRun) {
    const did = [];
    const steps = describe(plan);
    for (const [index, op] of plan.operations.entries()) {
        try {
            if (!dryRun)
                execute(repo, number, op);
            did.push(steps[index]);
        }
        catch (error) {
            // A rerun is a courtesy. GitHub refuses one for a run past its retention, which is exactly
            // the stale population this tool exists for, and that must not block the merge behind it.
            if (op.kind === "rerun") {
                did.push(`${steps[index]} (refused, skipped)`);
                continue;
            }
            const failure = `${steps[index] ?? "plan"}: ${firstLine(error)}`;
            if (did.includes("comment")) {
                try {
                    execute(repo, number, { kind: "comment", body: `### GitHub Manager — could not finish\n\nThe step \`${steps[index]}\` failed, so the action announced above was **not** completed. Done before it: ${did.join(", ")}. The next run will look again.` });
                }
                catch { /* reported in the digest regardless */ }
            }
            return { number, verdict: plan.verdict, overridden: plan.overridden, did, error: failure };
        }
    }
    return { number, verdict: dryRun ? `${plan.verdict} (dry run)` : plan.verdict, overridden: plan.overridden, did };
}
export function ghManagerSweep(repoArg, out) {
    const repo = assertRepository(repoArg ?? "");
    const policy = fetchPolicy(repo);
    if (!policy || !policy.enabled) {
        // Not opted in is an answer, and a different one from "nothing to do".
        console.log(`${repo} has ${policy ? "disabled the GitHub Manager in" : "no"} ${GH_MANAGER_POLICY_PATH}; nothing was inspected.`);
        output("enabled", "false");
        output("sessions", "[]");
        return 0;
    }
    const at = new Date();
    const routed = sweep(fetchOpenPullRequests(repo), policy, at);
    const file = { repo, at: at.toISOString(), policy, routed };
    write(out, JSON.stringify(file, null, 2));
    for (const r of routed)
        console.error(`#${r.number} ${r.route}: ${r.reason} — ${r.detail}`);
    output("enabled", "true");
    output("sessions", JSON.stringify(routed.filter(r => r.route === "session").map(r => r.number)));
    output("model", policy.model);
    return 0;
}
export function ghManagerRoutes(repoArg, sweepPath, outDir, dryRun) {
    const repo = assertRepository(repoArg ?? "");
    const file = readSweep(sweepPath);
    let failed = 0;
    for (const routed of file.routed.filter(r => r.route === "merge" || r.route === "close" || r.route === "escalate")) {
        const live = fetchLiveState(repo, routed.number);
        const plan = live.open ? planRoute(routed, live, { policy: file.policy, attempts: routed.attempts, now: new Date(), runUrl: runUrl() }) : { verdict: "wait", overridden: "already closed", operations: [] };
        const outcome = carryOut(repo, routed.number, plan, dryRun);
        if (outcome.error)
            failed++;
        console.error(`#${routed.number} ${outcome.verdict}: ${outcome.did.join(", ") || "nothing to do"}${outcome.error ? ` — FAILED ${outcome.error}` : ""}`);
        if (outDir)
            write(join(outDir, `outcome-${routed.number}.json`), JSON.stringify(outcome, null, 2));
    }
    return failed ? 1 : 0;
}
function overlay(repo) {
    try {
        return execFileSync("gh", ["api", `repos/${repo}/contents/${OVERLAY_PATH}`, "-H", "Accept: application/vnd.github.raw+json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    }
    catch (error) {
        // Absent is the common case. Anything else is reported, because a project that wrote
        // additions and silently had them dropped would never learn why they were ignored.
        const stderr = String(error.stderr ?? "");
        if (!/HTTP 404/.test(stderr))
            throw new Error(`could not read ${OVERLAY_PATH} from ${repo}: ${stderr.trim()}`);
        return undefined;
    }
}
export function ghManagerPrompt(repoArg, prArg, sweepPath, out) {
    const repo = assertRepository(repoArg ?? "");
    const number = Number(prArg);
    const file = readSweep(sweepPath);
    const routed = file.routed.find(r => r.number === number && r.route === "session");
    if (!routed)
        throw new Error(`#${prArg} was not routed to a session by this sweep`);
    const live = fetchLiveState(repo, number);
    // The sweep head is the "before" the apply step measures the session's commits against. A
    // branch that moved since the sweep has someone else on it, and their commits must not be
    // counted as the session's.
    if (live.headSha !== routed.headSha)
        throw new Error(`#${number} moved after the sweep (${routed.headSha.slice(0, 12)} to ${live.headSha.slice(0, 12)}); no session is started`);
    // Both names go into a command the session is told to run.
    if (!SAFE_REF.test(live.branch) || !SAFE_REF.test(live.base))
        throw new Error(`#${number} has a branch or base name the manager will not put in a brief`);
    const decisionPath = process.env["GH_MANAGER_DECISION"];
    if (!decisionPath)
        throw new Error("GH_MANAGER_DECISION must name where the session writes its decision");
    // Beside the decision, so the one artifact upload carries both to the apply job.
    const evidenceDir = join(dirname(decisionPath), `evidence-${number}`);
    mkdirSync(evidenceDir, { recursive: true });
    write(out, sessionPrompt({
        repo,
        number,
        branch: live.branch,
        base: live.base,
        sweepDetail: routed.detail,
        attempts: routed.attempts,
        runRef: `${runUrl()} (pull request ${number})`,
        decisionPath,
        evidenceDir,
        cli: process.env["MORPHEUS_CLI"] ?? "morpheus",
        policy: file.policy,
        overlay: overlay(repo),
    }));
    output("branch", live.branch);
    output("head", live.headSha);
    return 0;
}
export function ghManagerApply(repoArg, prArg, sweepPath, decisionPath, out, dryRun) {
    const repo = assertRepository(repoArg ?? "");
    const number = Number(prArg);
    const file = readSweep(sweepPath);
    const routed = file.routed.find(r => r.number === number);
    if (!routed)
        throw new Error(`#${prArg} is not in this sweep`);
    const ctx = { policy: file.policy, attempts: routed.attempts, now: new Date(), runUrl: runUrl() };
    let decision;
    let problem = "";
    if (!decisionPath || !existsSync(decisionPath))
        problem = "no decision file was written";
    else {
        try {
            decision = Decision.parse(JSON.parse(readFileSync(decisionPath, "utf8")));
            if (decision.pr !== number) {
                problem = `the decision is for #${decision.pr}`;
                decision = undefined;
            }
        }
        catch (error) {
            problem = `the decision file is invalid (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`;
        }
    }
    // Screenshots go up before anything is planned, so the body the plan writes already carries
    // their links. If they cannot be published the merge cannot rest on them: escalate instead.
    if (decision && decision.evidence.length && decisionPath) {
        const outcome = publishDecisionEvidence(repo, number, decision, join(dirname(decisionPath), `evidence-${number}`), dryRun);
        if ("problem" in outcome)
            decision = { ...decision, action: "escalate", needsHuman: `The session captured screenshots as visual evidence, but they could not be published: ${outcome.problem}. Attach the evidence by hand.` };
        else
            decision = { ...decision, body: outcome.body };
    }
    else if (decision?.body && hasPlaceholder(decision.body)) {
        decision = { ...decision, action: "escalate", needsHuman: "The session left a screenshot placeholder in the pull request body but listed no screenshots. Attach the visual evidence by hand." };
    }
    const live = fetchLiveState(repo, number, decision?.supersededBy);
    // A checkout of the target lets the session's own commits and record be read with Git rather
    // than taken on its word. Without one both stay at their refusing values.
    const checkout = process.env["GH_MANAGER_CHECKOUT"];
    if (checkout && decision) {
        const trunk = `origin/${live.base}`;
        live.sessionPushed = sessionPushed(checkout, routed.headSha, live.headSha, trunk);
        if (decision.usedManagerReview)
            live.recordProblem = managerRecordProblem(checkout, decision.body ?? live.body, live.headSha, trunk);
    }
    else if (decision?.usedManagerReview) {
        live.recordProblem = "no checkout was available to validate it";
    }
    const plan = !live.open
        ? { verdict: "wait", overridden: "the pull request closed or merged during the session", operations: [] }
        // The session step leaves a result file the moment it starts, even if it then times out.
        // No decision and no result file means no session ran at all (the brief was refused, most
        // often because the branch moved after the sweep), and nothing is counted against the
        // pull request. A session that started and reported nothing is counted.
        : !decision && !sessionStarted(decisionPath, number)
            ? { verdict: "wait", overridden: "no session ran for this pull request", operations: [] }
            : decision ? planDecision(decision, live, ctx) : planNoDecision(problem, live, ctx);
    const outcome = carryOut(repo, number, plan, dryRun);
    console.error(`#${number} ${outcome.verdict}: ${outcome.did.join(", ") || "nothing to do"}${outcome.overridden ? ` (overridden: ${outcome.overridden})` : ""}${outcome.error ? ` — FAILED ${outcome.error}` : ""}`);
    write(out, JSON.stringify(outcome, null, 2));
    return outcome.error ? 1 : 0;
}
function publishDecisionEvidence(repo, pr, decision, dir, dryRun) {
    if (!decision.body)
        return { problem: "the decision lists screenshots but carries no body to show them in" };
    const prepared = prepareEvidence(dir, decision.evidence);
    if ("problem" in prepared)
        return prepared;
    let published;
    try {
        published = dryRun
            ? prepared.items.map(item => ({ file: item.file, caption: item.caption, url: evidenceUrl(repo, pr, item) }))
            : publishEvidence(repo, pr, prepared.items);
    }
    catch (error) {
        return { problem: firstLine(error) };
    }
    return substituteEvidence(decision.body, published);
}
function sessionStarted(decisionPath, number) {
    return Boolean(decisionPath && existsSync(join(dirname(decisionPath), `session-result-${number}.json`)));
}
export function ghManagerDigest(repoArg, sweepPath, outcomesDir, dryRun) {
    const repo = assertRepository(repoArg ?? "");
    const file = readSweep(sweepPath);
    const outcomes = outcomesDir && existsSync(outcomesDir)
        ? readdirSync(outcomesDir, { recursive: true }).map(String).filter(name => /(^|\/)outcome-\d+\.json$/.test(name)).map(name => JSON.parse(readFileSync(join(outcomesDir, name), "utf8")))
        : [];
    const markdown = renderDigest({ repo, runUrl: runUrl(), at: new Date(file.at), routed: file.routed, outcomes });
    if (dryRun) {
        console.log(markdown);
        return 0;
    }
    const issue = postDigest(repo, markdown);
    console.error(`Digest posted to ${repo}#${issue}.`);
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary)
        appendFileSync(summary, `## ${repo}\n\n${markdown}\n`);
    return 0;
}
//# sourceMappingURL=gh-manager.js.map