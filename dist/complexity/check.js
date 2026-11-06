import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gitSubprocessEnv } from "../git-env.js";
import { resolveTrunk } from "../session/git.js";
import { allFiles, changedFiles } from "./diff.js";
import { applyMode, evaluate, measurements } from "./evaluate.js";
import { run, RUNNER_PATH, toolStatus } from "./install.js";
import { LIZARD_PIN } from "./pin.js";
import { inScope, policyDelta, readConfig } from "./policy.js";
export async function runCheck(opts) {
    const env = opts.env ?? process.env;
    const read = await projectConfig(opts.root);
    if (!read.ok)
        return notRun(read.reason, false, "unknown");
    const { config, enrolled } = read;
    const tool = await toolStatus(opts.pin ?? LIZARD_PIN, env);
    if (tool.state !== "ok")
        return notRun(`${tool.reason}. Run \`morpheus complexity install\`.`, enrolled, config.mode);
    const scoped = await scope(opts, config);
    if (!scoped.ok)
        return notRun(scoped.reason, enrolled, config.mode);
    const measured = await measure(opts.root, tool.toolchain.python, tool.toolchain.lizard, [...scoped.targets.keys()]);
    if (!measured.ok)
        return notRun(measured.reason, enrolled, config.mode);
    const evaluation = evaluate(config, measured.files, scoped.targets, opts.all ? "all" : "changed");
    const findings = applyMode(config, evaluation.findings);
    const delta = scoped.mergeBase ? policyDelta(await baseBlock(opts.root, scoped.mergeBase), read.raw) : [];
    const exitCode = findings.some((f) => f.severity === "error") ? 1 : 0;
    return { state: "ran", enrolled, config, scope: opts.all ? "all" : "changed", mergeBase: scoped.mergeBase, delta, evaluation, findings, files: measurements(measured.files, scoped.targets), lizardVersion: measured.lizardVersion, exitCode };
}
export async function projectConfig(root) {
    return readConfig(await readFile(join(root, "morpheus.json"), "utf8").catch(() => null));
}
function notRun(reason, enrolled, mode) {
    return { state: "not-run", reason, enrolled, mode, exitCode: 2 };
}
async function scope(opts, config) {
    const base = opts.base ?? (await trunkRef(opts.root));
    if (opts.all) {
        const listed = await allFiles(opts.root, opts.untracked ?? true);
        if (!listed.ok)
            return listed;
        const targets = new Map(listed.files.filter((p) => inScope(config, p)).map((p) => [p, "all"]));
        const mb = await run("git", ["merge-base", base, "HEAD"], { cwd: opts.root, env: gitSubprocessEnv() });
        return { ok: true, targets, mergeBase: mb.code === 0 ? mb.stdout.trim() : null };
    }
    const changes = await changedFiles(opts.root, base, opts.untracked ?? true);
    if (!changes.ok)
        return changes;
    const inside = changes.files.filter((f) => inScope(config, f.path));
    return { ok: true, targets: new Map(inside.map((f) => [f.path, f])), mergeBase: changes.mergeBase };
}
async function trunkRef(root) {
    const trunk = await resolveTrunk(root);
    return `${trunk.remote}/${trunk.branch}`;
}
async function baseBlock(root, mergeBase) {
    const shown = await run("git", ["show", `${mergeBase}:morpheus.json`], { cwd: root, env: gitSubprocessEnv() });
    if (shown.code !== 0)
        return undefined;
    const read = readConfig(shown.stdout);
    return read.ok ? read.raw : "(unreadable)";
}
async function measure(root, python, lizard, paths) {
    if (paths.length === 0)
        return { ok: true, files: [], lizardVersion: null };
    const result = await run(python, ["-I", "-B", RUNNER_PATH, "--lizard", lizard], { cwd: root, input: JSON.stringify(paths) });
    if (result.code !== 0)
        return { ok: false, reason: `the analyzer failed: ${result.stderr.trim().split("\n").pop() ?? "no output"}` };
    try {
        const parsed = JSON.parse(result.stdout);
        if (parsed.files.length !== paths.length)
            return { ok: false, reason: `the analyzer returned ${parsed.files.length} results for ${paths.length} files` };
        return { ok: true, files: parsed.files, lizardVersion: parsed.lizardVersion };
    }
    catch {
        return { ok: false, reason: "the analyzer printed no JSON" };
    }
}
//# sourceMappingURL=check.js.map