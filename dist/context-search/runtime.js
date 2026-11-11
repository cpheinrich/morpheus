import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const VERSION = "0.27.0";
// Published macOS and Linux wheels; installs never build native code from an sdist.
const HASHES = [
    "86b660aaa8055a1b4e1bdc2ee88c57b05bc3639f65671cf8aa456208d957bd36",
    "c9618046910f3d22cd3d08c6561379cae025adcfb98f66e11255703a2b82d53f",
    "7e3ba1f366e05a4ebf176cd549206fa25bdac9ea722637b21fa351582b65440e",
    "2d5d5ac2f16038b7ea4cfc10839d20dbec87b5a96076b0984b493e410c1a8415",
    "16363e6ff420e35719729cc969cc271b26926c38023ebb75330322d14f9524e2",
    "36dfe98d54163c1ce13d4cc1b54f77a4b7f05f3dfa7fed28133eb946284dd6ea",
];
const pythonIn = (root) => join(root, "bin", "python");
const toolsRoot = () => process.env.MORPHEUS_TOOLS_DIR || join(homedir(), ".morpheus", "tools");
const managedRoot = () => join(toolsRoot(), "context-search", VERSION);
export function tantivyPython() {
    const managed = pythonIn(managedRoot());
    const pilot = pythonIn(join(toolsRoot(), "context-search"));
    return process.env.MORPHEUS_TANTIVY_PYTHON || (existsSync(managed) ? managed : existsSync(pilot) ? pilot : "python3");
}
async function ready(python) {
    return exec(python, ["-I", "-c", "from importlib.metadata import version; import tantivy; print(version('tantivy'))"], { timeout: 5_000 })
        .then(({ stdout }) => stdout.trim() === VERSION, () => false);
}
async function buildRuntime(root) {
    const python = process.env.MORPHEUS_PYTHON || "python3";
    await exec(python, ["-I", "-m", "venv", root], { timeout: 30_000 });
    const requirements = join(root, "requirements.txt");
    await writeFile(requirements, `tantivy==${VERSION} ${HASHES.map(hash => "--hash=sha256:" + hash).join(" ")}\n`);
    await exec(pythonIn(root), [
        "-I", "-m", "pip", "--isolated", "install", "--disable-pip-version-check", "--no-input",
        "--index-url", "https://pypi.org/simple", "--require-hashes", "--no-deps", "--only-binary=:all:", "-r", requirements,
    ], { timeout: 120_000 });
    if (!await ready(pythonIn(root)))
        throw new Error("The installed binding could not be imported.");
}
/** Publish only a working runtime; a concurrent successful install also satisfies the request. */
export async function installTantivyRuntime() {
    const target = managedRoot();
    const python = pythonIn(target);
    if (await ready(python))
        return python;
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const staging = await mkdtemp(join(dirname(target), ".install-"));
    try {
        await buildRuntime(staging);
        await rename(staging, target).catch(async (error) => {
            if (!await ready(python))
                throw error;
        });
        if (!await ready(python))
            throw new Error("The published binding could not be imported.");
        return python;
    }
    catch (error) {
        const detail = error.stderr?.trim().split("\n").at(-1) || String(error);
        throw new Error(`Tantivy runtime setup failed (${detail}). Install Python 3.11+ with venv support and run morpheus context runtime install. If ${target} is broken, move it aside first.`);
    }
    finally {
        await rm(staging, { recursive: true, force: true });
    }
}
//# sourceMappingURL=runtime.js.map