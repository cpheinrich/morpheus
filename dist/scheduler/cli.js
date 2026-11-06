import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import { admit } from "./admit.js";
import { createGitHub } from "./github.js";
import { formatIssues, hostConfigSchema } from "./schema.js";
import { health, readStatus, tick, withLock, writeStatus } from "./tick.js";
const USAGE = `Usage:
  morpheus scheduler tick --config <path> [--backup] [--dry-run]
  morpheus scheduler status --config <path>
  morpheus scheduler admit --scheduler-id <id> --scheduled-for <UTC instant>`;
export async function loadHostConfig(path) {
    const absolute = resolve(path);
    const parsed = hostConfigSchema.safeParse(JSON.parse(await readFile(absolute, "utf8")));
    if (!parsed.success)
        throw new Error(`${path}: ${formatIssues(parsed.error)}`);
    const configured = parsed.data.statusPath ?? "scheduler-status.json";
    const statusPath = isAbsolute(configured) ? configured : join(dirname(absolute), configured);
    return { config: parsed.data, statusPath };
}
/**
 * An explicit `githubAccount` asks the GitHub CLI for that account's token, with any ambient
 * token removed so it cannot answer instead; otherwise an explicitly supplied GH_TOKEN (the
 * GitHub-hosted backup). The token stays in this process: it is never printed or written.
 */
export async function resolveToken(config, deps) {
    const env = deps.env ?? process.env;
    if (config.githubAccount) {
        const { GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...rest } = env;
        const token = (await (deps.ghToken ?? ghAuthToken)(config.githubAccount, rest)).trim();
        if (!token)
            throw new Error(`gh returned no token for account ${config.githubAccount}`);
        return token;
    }
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    if (!token)
        throw new Error("no GitHub credential: set githubAccount in the config or supply GH_TOKEN");
    return token;
}
async function ghAuthToken(account, env) {
    try {
        const { stdout } = await promisify(execFile)("gh", ["auth", "token", "--user", account], { env, timeout: 15_000 });
        return stdout;
    }
    catch (error) {
        // execFile's message can echo stdout; report only the cause.
        throw new Error(`gh auth token --user ${account} failed (${error.code ?? "exit"})`);
    }
}
function client(token, env) {
    return createGitHub(token, { baseUrl: env.GITHUB_API_URL });
}
/** Admits (or declines) this run's scheduled occurrence and writes `admitted=` to the step output. */
async function admitCommand(values, env, github, log) {
    const output = env.GITHUB_OUTPUT;
    if (env.GITHUB_ACTIONS === "true" && !output)
        throw new Error("GITHUB_OUTPUT is not set");
    const input = {
        schedulerId: values["scheduler-id"],
        scheduledFor: values["scheduled-for"],
        repository: env.GITHUB_REPOSITORY ?? "",
        runId: Number(env.GITHUB_RUN_ID),
        runAttempt: Number(env.GITHUB_RUN_ATTEMPT ?? "1") || 1,
    };
    let api = null;
    if (input.schedulerId || input.scheduledFor) {
        const token = env.GH_TOKEN || env.GITHUB_TOKEN;
        if (!token)
            throw new Error("admit needs GH_TOKEN with actions: read");
        if (!input.repository || !Number.isSafeInteger(input.runId)) {
            throw new Error("admit runs inside GitHub Actions: GITHUB_REPOSITORY and GITHUB_RUN_ID are required");
        }
        api = github(token, env);
    }
    const result = await admit(input, api);
    if (output)
        await appendFile(output, `admitted=${result.admitted}\n`);
    log(`Scheduler admission: ${result.admitted ? "admitted" : "not admitted"} — ${result.reason}`);
    return 0;
}
/** One tick: dispatches due occurrences (under the lock unless a dry run) and reports each schedule. */
async function tickCommand(config, statusPath, values, deps, github, env, log, now) {
    const api = github(await resolveToken(config, deps), env);
    const mode = values.backup ? "backup" : "primary";
    const run = async () => {
        const status = await tick({ config, github: api, mode, dryRun: values["dry-run"], previous: await readStatus(statusPath), now });
        // A dry run is read-only: it reports, and leaves the status file to the real ticks.
        if (!values["dry-run"])
            await writeStatus(statusPath, status);
        return status;
    };
    const status = values["dry-run"] ? await run() : await withLock(statusPath, run);
    for (const repo of status.repositories) {
        if (repo.error)
            log(`${repo.repository}: error — ${repo.error}`);
        for (const s of repo.schedules) {
            const detail = s.error ?? s.reason ?? s.runUrl ?? "";
            log(`${repo.repository} ${s.id}: ${s.outcome}${s.dueAt ? ` (due ${s.dueAt})` : ""}${detail ? ` — ${detail}` : ""}`);
        }
    }
    if (values["dry-run"])
        log(JSON.stringify(status, null, 2));
    return status.ok ? 0 : 1;
}
export async function runScheduler(argv, deps = {}) {
    const env = deps.env ?? process.env;
    const log = deps.log ?? (line => console.log(line));
    const now = deps.now ?? (() => new Date());
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        options: {
            config: { type: "string" },
            backup: { type: "boolean", default: false },
            "dry-run": { type: "boolean", default: false },
            "scheduler-id": { type: "string", default: "" },
            "scheduled-for": { type: "string", default: "" },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    const command = positionals[0];
    if (values.help || !command) {
        log(USAGE);
        return values.help ? 0 : 1;
    }
    const github = deps.github ?? client;
    if (command === "admit")
        return admitCommand(values, env, github, log);
    if (!values.config)
        throw new Error(`--config is required\n${USAGE}`);
    const { config, statusPath } = await loadHostConfig(values.config);
    if (command === "status") {
        const status = await readStatus(statusPath);
        const verdict = health(status, now());
        log(JSON.stringify({ healthy: verdict.healthy, reasons: verdict.reasons, status }, null, 2));
        return verdict.healthy ? 0 : 1;
    }
    if (command === "tick")
        return tickCommand(config, statusPath, values, deps, github, env, log, now);
    throw new Error(`Unknown scheduler command "${command}"\n${USAGE}`);
}
//# sourceMappingURL=cli.js.map