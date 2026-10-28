import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { gitSubprocessEnv } from "../git-env.js";
import { EXIT, parseDuration, runPollGuard, waitCi, waitRun } from "../wait-ci/index.js";
export const DEFAULT_TIMEOUT = "45m";
/** `gh` as a child process that never throws: a non-zero exit is data the loop decides about. */
export const ghRunner = (args) => new Promise((resolve) => {
    execFile("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr || (error && typeof error.code !== "number" ? error.message : "") });
    });
});
/**
 * The combinations that are a mistake rather than a request. Each mode has
 * one way to name what it waits for; a second one silently ignored would
 * wait on something other than what was typed.
 */
export function usageError(flags) {
    const modes = [flags.target !== undefined, flags.run !== undefined, flags.workflow !== undefined].filter(Boolean).length;
    if (modes > 1)
        return "wait-ci takes one of <pr|branch>, --run <id> or --workflow <name|file>, not several.";
    if (flags.extra.length > 0)
        return `wait-ci takes one PR number or branch, got also: ${flags.extra.join(" ")}`;
    if (flags.run !== undefined && !/^\d+$/.test(flags.run))
        return `--run takes a workflow run's numeric id, got "${flags.run}".`;
    if (flags.workflow === "")
        return "--workflow takes a workflow name or file.";
    if ((flags.branch !== undefined || flags.sha !== undefined) && flags.workflow === undefined) {
        return "--branch and --sha select among a workflow's runs; use them with --workflow <name|file>.";
    }
    if (flags.requiredOnly && (flags.run !== undefined || flags.workflow !== undefined)) {
        return "--required-only applies to a pull request's checks; a run's own conclusion decides --run and --workflow.";
    }
    return null;
}
/** `morpheus wait-ci` — block once on a PR's checks, or on one workflow run, and print the digest. */
export async function waitCiCommand(flags, gh = ghRunner) {
    const usage = usageError(flags);
    if (usage) {
        console.error(usage);
        return EXIT.error;
    }
    const timeoutMs = parseDuration(flags.timeout ?? DEFAULT_TIMEOUT);
    if (timeoutMs === null) {
        console.error(`--timeout must be a positive duration such as 45m, 90s or 1h30m, got "${flags.timeout}".`);
        return EXIT.error;
    }
    const deps = { gh, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() };
    const result = flags.run !== undefined || flags.workflow !== undefined
        ? await waitRun(deps, { run: flags.run, workflow: flags.workflow, branch: flags.branch, sha: flags.sha, repo: flags.repo, timeoutMs })
        : await waitCi(deps, { target: flags.target, repo: flags.repo, timeoutMs, requiredOnly: flags.requiredOnly });
    (result.exitCode === EXIT.error ? console.error : console.log)(result.output);
    return result.exitCode;
}
const git = (cwd, args) => new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitSubprocessEnv() }, (error, stdout) => resolve(error ? null : stdout.trim()));
});
/**
 * The checkout whose `local/sessions/` keeps the state: the primary one, not
 * the task worktree the agent is in. `pm cleanup` refuses to remove a worktree
 * holding any ignored file other than its own lease, so state written there
 * would turn every finished task into a manual cleanup — and a session that
 * moves between worktrees of one repository is still one session.
 */
export async function guardRoot(cwd) {
    const lines = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]))?.split("\n");
    if (!lines || lines.length < 2)
        return null;
    const [common, toplevel] = lines;
    return basename(common) === ".git" ? dirname(common) : toplevel;
}
export const guardDeps = {
    root: guardRoot,
    read: (path) => readFile(path, "utf8").catch(() => null),
    write: async (path, data) => {
        await mkdir(dirname(path), { recursive: true });
        const staging = `${path}.${process.pid}.tmp`;
        await writeFile(staging, data, "utf8");
        await rename(staging, path);
    },
};
async function readStdin() {
    if (process.stdin.isTTY)
        return "";
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}
/**
 * `morpheus poll-guard` — the PreToolUse hook's decision, reading the hook
 * payload on stdin. Exit 2 with the reason on stderr refuses the call; every
 * other path exits 0.
 */
export async function pollGuardCommand(read = readStdin, deps = guardDeps) {
    const result = await runPollGuard(await read().catch(() => ""), deps);
    if (result.message)
        console.error(result.message);
    return result.exitCode;
}
//# sourceMappingURL=wait-ci.js.map