import { z } from "zod";
import { invariant } from "./state.js";
const id = z.number().int().positive(), sha = z.string().regex(/^[a-f0-9]{40}$/);
const repository = z.object({ id, full_name: z.string().min(1) });
const reference = z.object({ path: z.string().min(1), sha, ref: z.string().min(1).optional() });
const check = z.object({ id, name: z.string().min(1), head_sha: sha, status: z.string(), conclusion: z.string().nullable(), details_url: z.string().nullable(), check_suite: z.object({ id }), app: z.object({ id, slug: z.string(), owner: z.object({ login: z.string() }) }) });
const run = z.object({ id, workflow_id: id, path: z.string().min(1), check_suite_id: id, run_number: id, run_attempt: id, head_sha: sha, head_branch: z.string().min(1), event: z.string(), status: z.string(), conclusion: z.string().nullable(), repository, head_repository: repository, referenced_workflows: z.array(reference).optional() });
const job = z.object({ id, run_id: id, run_attempt: id, head_sha: sha, head_branch: z.string(), name: z.string().min(1), status: z.string(), conclusion: z.string().nullable(), check_run_url: z.string(), steps: z.array(z.unknown()), runner_id: z.number().int().nonnegative().nullable(), runner_name: z.string().nullable() });
/** Counts, duplicate detection and a finite ceiling make a partial provider list unknown. */
async function list(api, path, key, schema, maximum = 10_000) {
    const rows = [];
    let count;
    for (let page = 1; page <= Math.ceil(maximum / 100); page++) {
        const data = await api.request("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
        invariant(data && Number.isSafeInteger(data.total_count) && Number(data.total_count) >= 0 && Number(data.total_count) <= maximum, "Repair check inventory has unknown/over-limit total");
        count ??= Number(data.total_count);
        invariant(data.total_count === count, "Repair check inventory changed during pagination");
        const items = z.array(schema).parse(data[key]);
        invariant(items.length === Math.min(100, count - rows.length), "Repair check inventory is incomplete");
        rows.push(...items);
        invariant(new Set(rows.map(row => row.id)).size === rows.length, "Repair check inventory has duplicate identities");
        if (rows.length === count)
            return rows.sort((a, b) => a.id - b.id);
    }
    throw new Error("Repair check inventory exceeded its finite page bound");
}
function context(value) {
    const { referenced_workflows: _references, ...fields } = value;
    return fields;
}
function sameContext(a, b) {
    return a.workflow_id === b.workflow_id && a.path === b.path && a.head_sha === b.head_sha && a.head_branch === b.head_branch && a.event === b.event && a.repository.id === b.repository.id && a.repository.full_name === b.repository.full_name && a.head_repository.id === b.head_repository.id && a.head_repository.full_name === b.head_repository.full_name;
}
function definitions(value) {
    // A floated @main can legitimately resolve differently in the newer SourceCI.
    // An explicitly immutable reference cannot contradict its own resolved SHA.
    for (const ref of value.referenced_workflows ?? []) {
        const pinned = ref.path.match(/@([a-f0-9]{40})$/)?.[1];
        invariant(!pinned || pinned === ref.sha, "Repair workflow contradicts an immutable reference");
    }
}
function action(value) { return value.app.slug === "github-actions" && value.app.owner.login === "github"; }
function unique(values, message) { invariant(values.length === 1, message); return values[0]; }
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Read-only cancellation exception; all other conclusions retain the strict gate. */
export async function verifyRepairChecks(api, name, subject, baseRepository) {
    const root = `repos/${name}`, checksPath = `${root}/commits/${subject.sha}/check-runs?filter=all`;
    const acquire = async () => {
        const checks = await list(api, checksPath, "check_runs", check);
        invariant(checks.length > 0 && checks.every(item => item.head_sha === subject.sha && item.status === "completed" && ["success", "skipped", "neutral", "cancelled"].includes(item.conclusion ?? "")), "Repair head has failed/incomplete checks");
        const cancellations = checks.filter(item => item.conclusion === "cancelled"), superseded = [];
        if (!cancellations.length)
            return { checks, runs: [], jobs: [], superseded };
        invariant(subject.ref && subject.repo && baseRepository?.full_name === name, "Repair cancellation lacks exact PR repository/ref context");
        // GitHub caps searches using head_sha at 1000; refuse instead of claiming completeness.
        const runs = await list(api, `${root}/actions/runs?head_sha=${subject.sha}`, "workflow_runs", run, 999);
        invariant(runs.every(value => value.head_sha === subject.sha && value.repository.id === baseRepository.id && value.repository.full_name === name), "Repair same-head inventory has foreign run context");
        const jobs = new Map(), details = new Map();
        const readRun = async (runId) => {
            if (!details.has(runId)) {
                const value = run.parse(await api.request("GET", `${root}/actions/runs/${runId}`));
                const inventory = unique(runs.filter(item => item.id === runId), "Repair run is absent from complete same-head inventory");
                invariant(JSON.stringify(context(value)) === JSON.stringify(context(inventory)), "Repair run changed from inventory");
                definitions(value);
                details.set(runId, value);
            }
            return details.get(runId);
        };
        const readJobs = async (value) => {
            const key = `${value.id}/${value.run_attempt}`;
            if (!jobs.has(key))
                jobs.set(key, await list(api, `${root}/actions/runs/${value.id}/attempts/${value.run_attempt}/jobs`, "jobs", job));
            return jobs.get(key);
        };
        const boundJob = (value, execution) => value.run_id === execution.id && value.run_attempt === execution.run_attempt && value.head_sha === subject.sha && value.head_branch === subject.ref;
        const boundCheck = (value, execution, work) => value.head_sha === subject.sha && value.check_suite.id === execution.check_suite_id && value.name === work.name && work.check_run_url === `https://api.github.com/${root}/check-runs/${value.id}`;
        for (const cancelled of cancellations) {
            invariant(action(cancelled), "Repair cancelled check is not GitHub Actions");
            const ids = cancelled.details_url?.match(new RegExp(`^https://github\\.com/${escaped(name)}/actions/runs/([0-9]+)/job/([0-9]+)$`));
            invariant(ids, "Repair cancelled check lacks an exact job URL");
            const old = await readRun(Number(ids[1])), work = job.parse(await api.request("GET", `${root}/actions/jobs/${ids[2]}`));
            invariant(old.head_sha === subject.sha && old.head_branch === subject.ref && old.event === "pull_request" && old.repository.id === baseRepository.id && old.repository.full_name === name && old.head_repository.id === subject.repo.id && old.head_repository.full_name === subject.repo.full_name, "Repair run differs from verified PR context");
            invariant(old.status === "completed" && old.conclusion === "cancelled" && boundJob(work, old) && boundCheck(cancelled, old, work) && work.id === Number(ids[2]) && work.status === "completed" && work.conclusion === "cancelled" && work.steps.length === 0 && [null, 0].includes(work.runner_id) && [null, ""].includes(work.runner_name), "Repair cancellation has execution or unknown job evidence");
            const oldJobs = await readJobs(old), oldJob = unique(oldJobs.filter(item => item.name === work.name), "Repair cancelled job name is ambiguous");
            invariant(JSON.stringify(oldJob) === JSON.stringify(work), "Repair cancelled job differs from complete attempt inventory");
            unique(checks.filter(item => item.check_suite.id === old.check_suite_id && item.name === cancelled.name && item.app.id === cancelled.app.id), "Repair cancelled check name is ambiguous");
            const equivalent = runs.filter(item => sameContext(old, item));
            invariant(equivalent.length > 0, "Repair workflow context is absent");
            const latestNumber = Math.max(...equivalent.map(item => item.run_number));
            const latest = unique(equivalent.filter(item => item.run_number === latestNumber), "Repair latest workflow identity is ambiguous");
            invariant(latest.run_number > old.run_number && latest.id !== old.id, "Repair cancellation has no strictly newer run");
            const successor = await readRun(latest.id);
            invariant(successor.status === "completed" && successor.conclusion === "success", "Repair latest workflow has not succeeded");
            const replacement = unique((await readJobs(successor)).filter(item => item.name === work.name), "Repair successor job name is ambiguous");
            invariant(boundJob(replacement, successor) && replacement.status === "completed" && replacement.conclusion === "success" && replacement.steps.length > 0, "Repair successor job has not executed successfully");
            const replacementCheck = unique(checks.filter(item => item.app.id === cancelled.app.id && action(item) && boundCheck(item, successor, replacement)), "Repair successor check is missing or ambiguous");
            invariant(replacementCheck.status === "completed" && replacementCheck.conclusion === "success", "Repair successor check has not succeeded");
            superseded.push({ checkId: cancelled.id, successorCheckId: replacementCheck.id, oldRun: old, successorRun: successor });
        }
        return { checks, runs, jobs: [...jobs].sort(([a], [b]) => a.localeCompare(b)), superseded };
    };
    const first = await acquire();
    if (first.superseded.length) {
        const final = await acquire();
        invariant(JSON.stringify(first) === JSON.stringify(final), "Repair check/workflow view changed; retain checkpoint");
    }
    return { checkIds: first.checks.map(item => item.id), superseded: first.superseded };
}
//# sourceMappingURL=repair-checks.js.map