import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
/**
 * How long an answer is reused. Short on purpose: a repository can be made
 * public at any time, and a cached `PRIVATE` older than this would publish to
 * it. One hour costs at most one `gh` call per hour of dirty-trunk rescues,
 * which are rare.
 */
export const VISIBILITY_CACHE_MS = 60 * 60 * 1000;
/** gh's `{"visibility": "…"}`, or null for anything else. */
export function parseGhVisibility(stdout) {
    try {
        const value = JSON.parse(stdout).visibility;
        return value === "PUBLIC" || value === "PRIVATE" || value === "INTERNAL" ? value : null;
    }
    catch {
        return null;
    }
}
/** `owner/repo` from a GitHub remote URL, or null. */
export function githubRepo(url) {
    const m = url.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    return m ? `${m[1]}/${m[2]}` : null;
}
const exec = promisify(execFile);
async function gitLines(root, args) {
    try {
        const { stdout } = await exec("git", args, { cwd: root, timeout: 15_000, env: gitSubprocessEnv() });
        return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    }
    catch {
        return []; // `git config --get-all` exits 1 when the key is unset.
    }
}
/** A URL fit to print: any `user:token@` is dropped. */
const redactUrl = (url) => url.replace(/\/\/[^/@\s]*@/, "//");
/** A path on this machine. A push there publishes nothing. */
const isLocalPath = (url) => /^(\/|\.{1,2}\/|~|file:\/\/)/.test(url) || /^[A-Za-z]:[\\/]/.test(url);
/**
 * The repositories a rescue would publish to. Both what the remotes are
 * configured as (the repository a PR targets, before any `insteadOf` rewrite
 * of the transport) and where the push actually lands after rewriting
 * (`git remote get-url --push --all`), because a `pushInsteadOf` can send the
 * branch somewhere the configured URL does not name. Every GitHub repository
 * found either way is checked. Any URL that is neither a GitHub repository nor
 * a path on this machine is described in `unidentified`, and decides "local".
 */
export async function rescueRepositories(root, pushRemote, trunkRemote) {
    const repos = new Set();
    const unidentified = [];
    const read = async (remote, key, required) => {
        const urls = await gitLines(root, ["config", "--get-all", `remote.${remote}.${key}`]);
        if (required && !urls.length)
            unidentified.push(`remote ${remote} has no URL`);
        for (const url of urls) {
            const repo = githubRepo(url);
            if (repo)
                repos.add(repo.toLowerCase());
            else
                unidentified.push(`${redactUrl(url)} is not a GitHub repository`);
        }
    };
    await read(pushRemote, "pushurl", false);
    await read(pushRemote, "url", true);
    if (trunkRemote !== pushRemote)
        await read(trunkRemote, "url", true);
    for (const url of await gitLines(root, ["remote", "get-url", "--push", "--all", pushRemote])) {
        const repo = githubRepo(url);
        if (repo)
            repos.add(repo.toLowerCase());
        else if (!isLocalPath(url))
            unidentified.push(`pushes go to ${redactUrl(url)}, which is not a GitHub repository`);
    }
    return { repos: [...repos].sort(), unidentified };
}
function parseCache(raw) {
    try {
        const value = JSON.parse(raw ?? "");
        if (value?.version === 1 && value.repos && typeof value.repos === "object")
            return value;
    }
    catch {
        // Corrupt or absent: start empty, which only costs a re-read.
    }
    return { version: 1, repos: {} };
}
/**
 * A cached answer younger than `VISIBILITY_CACHE_MS`, or null. A timestamp in
 * the future (a clock moved back) is not fresh: that age cannot be measured.
 */
export function cachedVisibility(cache, repo, now) {
    const entry = cache.repos[repo];
    if (!entry)
        return null;
    const age = now.getTime() - Date.parse(entry.checkedAt);
    if (!Number.isFinite(age) || age < 0 || age >= VISIBILITY_CACHE_MS)
        return null;
    return entry.visibility === "PUBLIC" || entry.visibility === "PRIVATE" || entry.visibility === "INTERNAL" ? entry.visibility : null;
}
/**
 * Read each repository's visibility (cache first), and decide. Never throws:
 * every failure is a reason to keep the rescue local.
 */
export async function publishVerdict(root, targets, runner, now, cache) {
    const { repos, unidentified } = targets;
    if (unidentified.length)
        return { publish: false, repos, reason: `the repository's visibility cannot be read: ${unidentified[0]}` };
    if (!repos.length)
        return { publish: false, repos, reason: "no GitHub repository was found to check its visibility" };
    const stored = parseCache(cache ? await cache.read().catch(() => null) : null);
    let dirty = false;
    const answers = [];
    for (const repo of repos) {
        const cached = cachedVisibility(stored, repo, now);
        if (cached) {
            answers.push([repo, cached, undefined]);
            continue;
        }
        // Host-qualified, so a `GH_HOST` pointing at an enterprise server cannot answer for a
        // same-named repository there.
        const result = await runner("gh", ["repo", "view", `github.com/${repo}`, "--json", "visibility"], root)
            .catch((error) => ({ code: 1, stdout: "", stderr: String(error) }));
        const visibility = result.code === 0 ? parseGhVisibility(result.stdout) : null;
        if (visibility) {
            stored.repos[repo] = { visibility, checkedAt: now.toISOString() };
            dirty = true;
        }
        const failure = result.code !== 0
            ? (result.stderr || result.stdout || `exit ${result.code}`).trim().split("\n")[0]
            : visibility ? undefined : "gh returned no visibility";
        answers.push([repo, visibility, failure]);
    }
    if (dirty && cache)
        await cache.write(`${JSON.stringify(stored, null, 2)}\n`).catch(() => undefined);
    const notPrivate = answers.find(([, v]) => v === "PUBLIC") ?? answers.find(([, v]) => v === "INTERNAL");
    if (notPrivate)
        return { publish: false, repos, reason: `${notPrivate[0]} is ${notPrivate[1].toLowerCase()}` };
    const unread = answers.find(([, v]) => v === null);
    if (unread)
        return { publish: false, repos, reason: `the visibility of ${unread[0]} could not be read (${unread[2]})` };
    return { publish: true, repos };
}
/**
 * The cache file in the primary checkout's ignored `local/sessions/`. Not the
 * checkout a session is in: `pm cleanup` refuses a task worktree that holds
 * any other ignored file. And only where Git ignores it, so a repository that
 * does not ignore `local/` gets no file one `git add -A` from being committed;
 * there every rescue reads visibility afresh.
 */
export async function defaultVisibilityCache(root) {
    const lines = await gitLines(root, ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]);
    if (lines.length < 2)
        return null;
    const [common, toplevel] = lines;
    const primary = basename(common) === ".git" ? dirname(common) : toplevel;
    const relative = "local/sessions/repo-visibility.json";
    try {
        await exec("git", ["check-ignore", "-q", "--", relative], { cwd: primary, timeout: 15_000, env: gitSubprocessEnv() });
    }
    catch {
        return null;
    }
    const path = join(primary, relative);
    return {
        read: () => readFile(path, "utf8").catch(() => null),
        write: async (data) => {
            await mkdir(dirname(path), { recursive: true });
            const staging = `${path}.${process.pid}.tmp`;
            await writeFile(staging, data, "utf8");
            await rename(staging, path);
        },
    };
}
//# sourceMappingURL=repo-visibility.js.map