import { checkKey, counts, failed, formatDuration } from "./checks.js";
const short = (sha) => sha.slice(0, 7);
function label(check) {
    return check.workflow && !check.name.startsWith(check.workflow) ? `${check.name} (${check.workflow})` : check.name;
}
function tally(checks, noun = "check") {
    const c = counts(checks);
    const parts = [
        c.pass ? `${c.pass} passed` : "",
        c.skipped ? `${c.skipped} skipped` : "",
        c.fail ? `${c.fail} failed` : "",
        c.cancelled ? `${c.cancelled} cancelled` : "",
        c.pending ? `${c.pending} running` : "",
    ].filter(Boolean);
    return `${checks.length} ${noun}${checks.length === 1 ? "" : "s"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}
/**
 * The whole output of a wait: one line when green, and otherwise only what an
 * agent acts on — which check, where, and the failing step's own words.
 */
export function renderDigest(input) {
    const where = `${input.repo}#${input.pr} @ ${short(input.headSha)}`;
    const scope = input.requiredOnly ? "required " : "";
    const after = `after ${formatDuration(input.elapsedMs)}`;
    const failures = input.checks.filter(failed);
    const races = failures.filter((c) => input.details.get(checkKey(c))?.labelRace);
    const out = [];
    switch (input.verdict) {
        case "green":
            out.push(`✓ CI green — ${where} (${scope}${tally(input.checks)}) ${after}`);
            break;
        case "failed": {
            const raceOnly = races.length === failures.length;
            const still = input.timedOut ? "; stopped at the deadline with checks still running" : "";
            out.push(raceOnly
                ? `✗ CI blocked only by the agent-reviewed label race — ${where} (${scope}${tally(input.checks)}) ${after}${still}`
                : `✗ CI failed — ${where} (${scope}${tally(input.checks)}) ${after}${still}`);
            break;
        }
        case "pending":
            out.push(`… CI still running at the deadline — ${where} (${scope}${tally(input.checks)}) ${after}`);
            break;
        case "no-checks":
            out.push(input.requiredOnly && input.ignored > 0
                ? `? No required checks on ${where} ${after} (${input.ignored} non-required ignored by --required-only)`
                : `? No checks reported on ${where} ${after} — workflows may not have triggered, or this repository has no CI for the PR`);
            break;
    }
    if (input.movedFrom.length > 0) {
        out.push(`! head moved during the wait: ${[...input.movedFrom, input.headSha].map(short).join(" → ")}; results are for ${short(input.headSha)} only`);
    }
    if (input.truncated)
        out.push("! more than 100 checks: only the first page was read");
    if (input.pendingWorkflows)
        out.push("  … current-head Actions workflow runs pending or not yet verified; job checks may not have registered");
    out.push(...failureLines(failures, input.details));
    if (input.timedOut)
        out.push(...pendingLines(input.checks));
    if (input.verdict === "failed" && races.length > 0 && races.length === failures.length) {
        out.push("  Nothing to fix in code: apply agent-reviewed once the independent review is recorded, then re-check.");
    }
    return out.join("\n");
}
/**
 * One line per failed or cancelled check, then its failing step's own words.
 * Shared by the pull-request and run digests so a failure reads the same
 * whichever way it was waited on.
 */
function failureLines(failures, details) {
    const out = [];
    for (const check of failures) {
        const detail = details.get(checkKey(check));
        const mark = check.outcome === "cancelled" ? "⊘" : "✗";
        const race = detail?.labelRace ? " — label race: agent-reviewed not applied yet; not a code failure" : "";
        out.push(`  ${mark} ${label(check)}${check.url ? ` — ${check.url}` : ""}${race}`);
        if (detail?.labelRace)
            continue;
        if (detail?.logError)
            out.push(`      (log unavailable: ${detail.logError})`);
        if (detail?.log) {
            if (detail.log.step)
                out.push(`      step: ${detail.log.step}`);
            const omittedAt = detail.log.omitted > 0 ? detail.log.omittedAfter : -1;
            detail.log.lines.forEach((line, i) => {
                if (i === omittedAt)
                    out.push(`      │ … ${detail.log.omitted} lines omitted …`);
                out.push(`      │ ${line}`.trimEnd());
            });
        }
    }
    return out;
}
function pendingLines(checks) {
    return checks
        .filter((c) => c.outcome === "pending")
        .map((check) => `  … ${label(check)}${check.url ? ` — ${check.url}` : ""}`);
}
const CONCLUSION_WORDS = {
    failure: "failed",
    cancelled: "cancelled",
    timed_out: "timed out",
    startup_failure: "failed to start",
    action_required: "needs approval",
    stale: "went stale",
};
/**
 * The whole output of a run wait, in the pull-request digest's shape: one line
 * when green, and otherwise which job, where, and the failing step's words.
 */
export function renderRunDigest(input) {
    const after = `after ${formatDuration(input.elapsedMs)}`;
    const run = input.run;
    if (!run) {
        return `? No run of ${input.wanted} found ${after} — it may not have been triggered yet, or the filter matches nothing`;
    }
    const attempt = run.attempt > 1 ? ` (attempt ${run.attempt})` : "";
    const branch = run.headBranch ? ` on ${run.headBranch}` : "";
    const where = `${input.repo ? `${input.repo} ` : ""}${run.workflow} run ${run.id}${attempt} @ ${short(run.headSha)}${branch}`;
    const jobs = input.jobs.length > 0 ? ` (${tally(input.jobs, "job")})` : "";
    const out = [];
    switch (input.verdict) {
        case "green":
            out.push(`✓ Run green — ${where}${jobs} ${after}`);
            break;
        case "failed": {
            const word = CONCLUSION_WORDS[run.conclusion] ?? `ended ${run.conclusion || "unsuccessfully"}`;
            out.push(`✗ Run ${word} — ${where}${jobs} ${after}`);
            break;
        }
        default:
            out.push(`… Run still ${run.status.replace(/_/g, " ")} at the deadline — ${where}${jobs} ${after}`);
    }
    if (input.movedFrom.length > 0) {
        out.push(`! a newer matching run started during the wait: ${[...input.movedFrom, run.id].join(" → ")}; results are for run ${run.id} only`);
    }
    if (input.alreadyComplete) {
        out.push(`! run ${run.id} had already finished when the wait began and no newer run started; to wait for a specific one, pass --run <id> or --sha <commit>`);
    }
    if (input.jobsError)
        out.push(`  (job list unavailable: ${input.jobsError})`);
    if (input.verdict === "failed")
        out.push(...failureLines(input.jobs.filter(failed), input.details));
    if (input.timedOut)
        out.push(...pendingLines(input.jobs));
    if (input.verdict !== "green" && run.url)
        out.push(`  run: ${run.url}`);
    return out.join("\n");
}
//# sourceMappingURL=digest.js.map