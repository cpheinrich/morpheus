import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitSubprocessEnv } from "../git-env.js";
import { CANARY_EXPECTED, LIZARD_PIN, pinKey } from "./pin.js";
/** Every external program is started with an argument array; nothing reaches a shell. */
export function run(command, args, opts = {}) {
    return new Promise((resolveRun) => {
        const child = execFile(command, args, { cwd: opts.cwd, env: opts.env, timeout: 10 * 60_000, maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
            const failed = error;
            const code = !failed ? 0 : typeof failed.code === "number" ? failed.code : 1;
            resolveRun({ code, stdout: String(stdout), stderr: String(stderr || failed?.message || "") });
        });
        if (opts.input !== undefined)
            child.stdin?.end(opts.input);
    });
}
export const RUNNER_PATH = fileURLToPath(new URL("./lizard_runner.py", import.meta.url));
export function toolchainFor(pin = LIZARD_PIN, env = process.env) {
    const root = env["MORPHEUS_TOOLS_DIR"] || join(homedir(), ".morpheus", "tools");
    const dir = join(root, "lizard", pinKey(pin));
    return { dir, lizard: join(dir, "src"), python: join(dir, "venv", "bin", "python") };
}
/**
 * Runs the canary through the installed runtime. `ready.json` only names what
 * was installed; this is the proof it still works.
 */
export async function toolStatus(pin = LIZARD_PIN, env = process.env) {
    const toolchain = toolchainFor(pin, env);
    const stamp = await readFile(join(toolchain.dir, "ready.json"), "utf8").catch(() => null);
    if (stamp === null)
        return { state: "missing", toolchain, reason: `not installed for this pin (${toolchain.dir})` };
    const result = await run(toolchain.python, ["-I", "-B", RUNNER_PATH, "--lizard", toolchain.lizard, "--canary"]);
    if (result.code !== 0)
        return { state: "broken", toolchain, reason: `canary did not run: ${firstLine(result.stderr)}` };
    return canaryVerdict(toolchain, result.stdout);
}
function canaryVerdict(toolchain, stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        return { state: "broken", toolchain, reason: "canary printed no JSON" };
    }
    const row = parsed.files?.[0]?.functions?.find((f) => f.name === CANARY_EXPECTED.name);
    if (!row || row.ccn !== CANARY_EXPECTED.ccn || row.cognitive !== CANARY_EXPECTED.cognitive) {
        const got = row ? `CCN ${row.ccn}, cognitive ${row.cognitive}` : "no canary function";
        return { state: "broken", toolchain, reason: `canary measured ${got}; expected CCN ${CANARY_EXPECTED.ccn}, cognitive ${CANARY_EXPECTED.cognitive}` };
    }
    return { state: "ok", toolchain, lizardVersion: parsed.lizardVersion ?? null, python: parsed.python ?? "unknown" };
}
function firstLine(text) {
    return text.trim().split("\n").filter(Boolean).pop() ?? "no output";
}
/**
 * Installs the pinned analyzer: Lizard fetched by commit id, its two wheels
 * into a venv by hash. Built in a scratch directory and renamed into place,
 * so a failed install never leaves a stamp. Idempotent: a working install is
 * left alone.
 */
export async function installLizard(pin = LIZARD_PIN, env = process.env) {
    const current = await toolStatus(pin, env);
    if (current.state === "ok")
        return { ok: true, status: current, changed: false };
    const { dir } = current.toolchain;
    const scratch = `${dir}.tmp-${process.pid}`;
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
    const failure = await buildInto(scratch, pin, env);
    if (failure) {
        await rm(scratch, { recursive: true, force: true });
        return { ok: false, reason: failure };
    }
    await rm(dir, { recursive: true, force: true });
    await rename(scratch, dir);
    const status = await toolStatus(pin, env);
    if (status.state !== "ok")
        return { ok: false, reason: status.reason };
    return { ok: true, status, changed: true };
}
/** Each step returns null on success or the reason it failed. */
async function buildInto(dir, pin, env) {
    const python = env["MORPHEUS_PYTHON"] || "python3";
    return ((await checkPython(python, pin)) ??
        (await fetchLizard(join(dir, "src"), pin)) ??
        (await buildVenv(dir, python, pin)));
}
export async function checkPython(python, pin) {
    const probe = await run(python, ["-I", "-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
    if (probe.code !== 0)
        return `${python} is not runnable: ${firstLine(probe.stderr)}`;
    const [major, minor] = probe.stdout.trim().split(".").map(Number);
    const [floorMajor, floorMinor] = pin.pythonFloor;
    if (major === undefined || minor === undefined || major < floorMajor || (major === floorMajor && minor < floorMinor)) {
        return `${python} is ${probe.stdout.trim()}; the pinned analyzer needs ${floorMajor}.${floorMinor} or newer`;
    }
    return null;
}
async function fetchLizard(src, pin) {
    const git = (args) => run("git", args, { env: gitSubprocessEnv() });
    const steps = [
        ["init", "--quiet", src],
        ["-C", src, "fetch", "--quiet", "--depth", "1", "--no-tags", pin.repository, pin.commit],
        ["-C", src, "checkout", "--quiet", "--detach", "FETCH_HEAD"],
    ];
    for (const args of steps) {
        const result = await git(args);
        if (result.code !== 0)
            return `git ${args.slice(args[0] === "-C" ? 2 : 0, 3).join(" ")} failed: ${firstLine(result.stderr)}`;
    }
    const head = await git(["-C", src, "rev-parse", "HEAD"]);
    if (head.stdout.trim() !== pin.commit)
        return `fetched ${head.stdout.trim()}, not the pinned ${pin.commit}`;
    return null;
}
async function buildVenv(dir, python, pin) {
    const venv = await run(python, ["-I", "-m", "venv", join(dir, "venv")]);
    if (venv.code !== 0)
        return `python -m venv failed: ${firstLine(venv.stderr)}`;
    const requirements = join(dir, "requirements.txt");
    await writeFile(requirements, `${pin.requirements.join("\n")}\n`);
    const pip = await run(join(dir, "venv", "bin", "python"), [
        "-I", "-m", "pip", "install", "--isolated", "--disable-pip-version-check", "--no-input",
        "--require-hashes", "--no-deps", "--only-binary", ":all:", "-r", requirements,
    ]);
    if (pip.code !== 0)
        return `pip install failed: ${firstLine(pip.stderr)}`;
    await writeFile(join(dir, "ready.json"), `${JSON.stringify({ key: pinKey(pin), ...pin }, null, 2)}\n`);
    return null;
}
export function formatStatus(status) {
    if (status.state === "ok") {
        return `Lizard ${status.lizardVersion ?? "?"} at ${LIZARD_PIN.commit.slice(0, 12)} (Python ${status.python}): operational — canary measured as expected.`;
    }
    return `Lizard analyzer ${status.state}: ${status.reason}`;
}
//# sourceMappingURL=install.js.map