import { execFile } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
const RELEASE = "v1.97.0.0";
const COMMIT = "e75a69c9e15164d090e080fa001dc515495ec350";
const run = promisify(execFile);
function installation(directory, host) {
    const profiles = {
        CODEX_HOME: join(directory, ".codex"),
        CLAUDE_CONFIG_DIR: join(directory, ".claude"),
    };
    const root = host === "claude" ? profiles.CLAUDE_CONFIG_DIR : profiles.CODEX_HOME;
    return {
        release: RELEASE,
        skills: join(root, "skills"),
        env: {
            HOME: directory,
            ...profiles,
            GSTACK_ROOT: join(directory, ".claude", "skills", "gstack"),
            GSTACK_HOME: join(directory, "state"),
            GSTACK_STATE_ROOT: join(directory, "state"),
            GSTACK_SKIP_ASIDE: "1",
            PLAYWRIGHT_BROWSERS_PATH: join(directory, "browsers"),
        },
        pathPrefix: join(directory, "bun", "node_modules", ".bin"),
    };
}
async function activeInstall(directory) {
    try {
        const name = (await readFile(join(directory, "ready"), "utf8")).trim();
        if (!/^install-[a-zA-Z0-9]+$/.test(name))
            throw new Error("Invalid gstack cache receipt.");
        return join(directory, name);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
async function setup(directory, host) {
    const { env: runtime, pathPrefix } = installation(directory, host);
    // Upstream setup treats the profile as its home. Keep its tools and hooks in this cache.
    const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, ...runtime };
    const options = { cwd: directory, env, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 };
    await mkdir(join(runtime.CLAUDE_CONFIG_DIR, "skills"), { recursive: true });
    await run("git", ["clone", "--depth", "1", "--branch", RELEASE, "--no-tags",
        "https://github.com/garrytan/gstack.git", runtime.GSTACK_ROOT], options);
    const { stdout } = await run("git", ["-C", runtime.GSTACK_ROOT, "rev-parse", "HEAD"], options);
    if (stdout.trim() !== COMMIT)
        throw new Error(`gstack ${RELEASE} did not resolve to the pinned commit.`);
    await run("npm", ["install", "--prefix", join(directory, "bun"), "--no-audit", "--no-fund",
        "--no-save", "bun@1.4.2"], options);
    const setupOptions = {
        ...options,
        cwd: runtime.GSTACK_ROOT,
        env: { ...env, PATH: [pathPrefix, env.PATH].filter(Boolean).join(delimiter) },
    };
    await run("bash", ["./setup", "--host", host, "--prefix", "--no-team", "--no-harness-auto",
        "--no-plan-tune-hooks", "--no-timeline-stop-hook"], setupOptions);
    const config = join(runtime.GSTACK_ROOT, "bin", "gstack-config");
    await run(config, ["set", "update_check", "false"], setupOptions);
    await run(config, ["set", "telemetry", "off"], setupOptions);
}
export async function ensureGstack(host) {
    const cache = process.env.MORPHEUS_TOOLS_DIR || join(homedir(), ".morpheus", "tools");
    const directory = resolve(cache, "gstack", RELEASE, host);
    const active = await activeInstall(directory);
    if (active)
        return installation(active, host);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const candidate = await mkdtemp(join(directory, "install-"));
    let published = false;
    try {
        await setup(candidate, host);
        // Rendered skill paths are absolute, so publish a receipt without moving the install.
        const receipt = join(candidate, "receipt");
        await writeFile(receipt, basename(candidate), { mode: 0o600 });
        try {
            await link(receipt, join(directory, "ready"));
            published = true;
            return installation(candidate, host);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            const winner = await activeInstall(directory);
            if (!winner)
                throw error;
            return installation(winner, host);
        }
    }
    finally {
        if (!published)
            await rm(candidate, { recursive: true, force: true });
    }
}
//# sourceMappingURL=gstack-install.js.map