import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, runInContext } from "node:vm";
import { load } from "js-yaml";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

type Flags = { node: boolean; browser: boolean; bridge: boolean; artifacts: boolean };
type Scope = Flags & { reason: string };
const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/ci-scope.mjs");
const { selectPaths, detectScope } = await import(pathToFileURL(script).href) as {
  selectPaths(paths: string[]): Flags;
  detectScope(env: NodeJS.ProcessEnv, cwd: string): Scope;
};
const all = { node: true, browser: true, bridge: true, artifacts: true };
const none = { node: false, browser: false, bridge: false, artifacts: false };
const node = { ...none, node: true };
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "ci-scope-")); dirs.push(dir); return dir; };
const put = (dir: string, path: string, text = "fixture\n") => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
const git = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
function repo() {
  const dir = temp(); git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "CI test"); git(dir, "config", "user.email", "ci@example.invalid");
  put(dir, "docs/guide.md"); git(dir, "add", "."); git(dir, "commit", "-m", "base");
  return dir;
}
function commit(dir: string) { git(dir, "add", "-A"); git(dir, "commit", "-m", "change"); return git(dir, "rev-parse", "HEAD"); }
function event(base: string, head: string) {
  const path = join(temp(), "event.json");
  writeFileSync(path, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  return { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path };
}

describe("Morpheus CI inputs", () => {
  it.each([
    ["docs/paperclip-overview.md", none], ["hq/product/roadmap/item.md", none],
    [".agent/worklog/delivery.md", none], ["qa/acceptance/task.md", none],
    ["docs/runbooks/independent-review.md", node], ["docs/examples/firebase-release/backend.yml", node],
    ["src/cd/control.ts", node], ["tests/pm.test.ts", node],
    ["src/qa/web/server.ts", { ...node, browser: true }],
    ["dist/qa/store.js", { ...node, browser: true }], ["tests/browser/fixture.html", { ...node, browser: true }],
    ["plugins/codex-claude/src/service.mjs", { ...node, bridge: true }],
    [".github/actions/ios-testflight-upload/artifact-stage/stage.py", { ...node, browser: true, artifacts: true }],
    ["tests/artifacts/test_stage.py", { ...node, browser: true, artifacts: true }],
    ["tests/artifact-workflows.test.ts", { ...node, artifacts: true }],
    ["pnpm-lock.yaml", all], ["package.json", all], ["tsconfig.json", all],
    [".github/workflows/ci.yml", all], [".github/actions/new/action.yml", all],
    ["scripts/ci-scope.mjs", all], ["tests/ci-scope.test.ts", all], ["playwright.config.ts", all],
    ["AGENTS.md", all], ["README.md", all], ["unclassified.data", all],
    ["docs/not-prose.ts", all], [".agent/worklog/payload.sh", all],
  ] satisfies Array<[string, Flags]>)("selects the actual consumers of %s", (path, expected) => {
    expect(selectPaths([path])).toEqual(expected);
  });

  it("unions mixed paths without allowing a later prose path to clear a flag", () => {
    expect(selectPaths(["src/cd/control.ts", "plugins/codex-claude/src/service.mjs", "docs/guide.md"]))
      .toEqual({ ...node, bridge: true });
    expect(selectPaths(["unknown", "docs/guide.md"])).toEqual(all);
  });

  it("covers every repository import used by the actual browser and bridge tests", () => {
    const suites = ["tests/browser/qa-comments.spec.ts", "tests/browser/qa-web-context.spec.ts"];
    const plugin = join(root, "plugins/codex-claude");
    const pluginFiles = readdirSync(plugin, { recursive: true }).filter((p): p is string => typeof p === "string" && p.endsWith(".mjs") && !p.includes("node_modules"));
    for (const [roots, flag, sentinel] of [
      [suites.map(p => join(root, p)), "browser", "src/qa/web/server.ts"],
      [pluginFiles.map(p => join(plugin, p)), "bridge", "plugins/codex-claude/src/service.mjs"],
    ] as const) {
      const program = ts.createProgram([...roots], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ESNext, allowJs: true, skipLibCheck: true });
      const files = program.getSourceFiles().map(f => relative(root, f.fileName)).filter(p => !p.includes("node_modules") && !p.startsWith(".."));
      expect(files).toContain(sentinel);
      for (const file of files) expect(selectPaths([file])[flag], `${flag} input ${file}`).toBe(true);
    }
  });
});

describe("verified complete PR diff", () => {
  it("uses the merge base and all PR commits, not the base branch tip or latest push", () => {
    const dir = repo(), base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-b", "pr"); put(dir, "src/cd/task.ts"); commit(dir);
    put(dir, "docs/guide.md", "new prose"); const head = commit(dir);
    git(dir, "checkout", "main"); put(dir, "other-new-input", "main moved"); const moved = commit(dir);
    expect(detectScope(event(moved, head), dir)).toEqual({ ...node, reason: "verified cumulative PR diff: 2 path(s)" });
    expect(detectScope(event(base, base), dir)).toEqual({ ...none, reason: "verified cumulative PR diff: 0 path(s)" });
  });
  it("classifies both sides of renames and deleted code, including hostile filename characters", () => {
    const dir = repo(); put(dir, "src/cd/task.ts"); const base = commit(dir);
    git(dir, "mv", "src/cd/task.ts", "docs/moved.md"); const head = commit(dir);
    expect(detectScope(event(base, head), dir)).toMatchObject(node);
    mkdirSync(join(dir, "src/qa"), { recursive: true });
    git(dir, "mv", "docs/moved.md", "src/qa/new.ts"); const renamed = commit(dir);
    expect(detectScope(event(head, renamed), dir)).toMatchObject({ ...node, browser: true });
    git(dir, "rm", "src/qa/new.ts"); const deleted = commit(dir);
    expect(detectScope(event(renamed, deleted), dir)).toMatchObject({ ...node, browser: true });
    put(dir, "docs/$(touch SHOULD_NOT_EXIST)\nquoted'\".md"); const prose = commit(dir);
    expect(detectScope(event(deleted, prose), dir)).toMatchObject(none);
    expect(readdirSync(dir)).not.toContain("SHOULD_NOT_EXIST");
  });
  it("runs all on missing/invalid commits, malformed event, unrelated history or missing Git", () => {
    const dir = repo(), head = git(dir, "rev-parse", "HEAD");
    for (const base of ["a".repeat(40), "--help", "", head.toUpperCase()]) expect(detectScope(event(base, head), dir)).toMatchObject(all);
    const bad = event(head, head); writeFileSync(bad.GITHUB_EVENT_PATH!, "not json");
    expect(detectScope(bad, dir)).toMatchObject(all);
    git(dir, "checkout", "--orphan", "unrelated"); git(dir, "rm", "-r", "-f", ".");
    put(dir, "unrelated-root"); const foreignHead = commit(dir);
    expect(detectScope(event(foreignHead, head), dir)).toMatchObject(all);
    expect(detectScope(event(head, head), temp())).toMatchObject(all);
    expect(detectScope({ ...event(head, head), PATH: temp() }, dir)).toMatchObject(all);
    expect(detectScope({ ...process.env, GITHUB_EVENT_NAME: "push" }, dir)).toMatchObject(all);
    expect(detectScope({ ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch" }, dir)).toMatchObject(all);
  });
  it("never interprets incomplete or oversized Git output as a verified empty diff", () => {
    const dir = repo(), head = git(dir, "rev-parse", "HEAD"), bin = temp();
    const fake = join(bin, "git");
    writeFileSync(fake, `#!${process.execPath}\nconst command=process.argv[2];if(command==='rev-parse')process.stdout.write(process.env.FAKE_ROOT+'\\n');if(command==='merge-base')process.stdout.write(process.env.FAKE_BASE+'\\n');if(command==='diff')process.stdout.write(process.env.FAKE_MODE==='large'?'docs/guide.md\\0'.repeat(900000):'docs/guide.mdX');\n`);
    chmodSync(fake, 0o700);
    for (const mode of ["large", "incomplete"]) {
      expect(detectScope({ ...event(head, head), PATH: bin, FAKE_ROOT: dir, FAKE_BASE: head, FAKE_MODE: mode }, dir))
        .toEqual({ ...all, reason: "comparison unavailable; run all checks" });
    }
  });
  it("runs the real workflow command and writes all four explicit boolean outputs", () => {
    const dir = repo(), base = git(dir, "rev-parse", "HEAD"); put(dir, "docs/guide.md", "changed"); const head = commit(dir);
    const output = join(temp(), "output");
    execFileSync(process.execPath, [script], { cwd: dir, env: { ...event(base, head), GITHUB_OUTPUT: output }, stdio: "pipe" });
    expect(readFileSync(output, "utf8")).toBe("node=false\nbrowser=false\nbridge=false\nartifacts=false\n");
  });
});

describe("workflow dispatch and required status", () => {
  type Job = { if?: string; needs?: string | string[]; uses?: string; with?: Record<string, unknown>; steps?: Array<{ run?: string; with?: Record<string, unknown> }> };
  const workflow = load(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")) as { jobs: Record<string, Job> };
  const reusable = load(readFileSync(join(root, ".github/workflows/node-ci.yml"), "utf8")) as { on: { workflow_call: { inputs: Record<string, { default?: unknown }> } }; jobs: Record<string, Job> };
  const evaluate = (source: string, needs: unknown, cancelled = false) => {
    const expression = source.replace(/^\$\{\{\s*|\s*\}\}$/g, "").replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (_, key: string) => `[${JSON.stringify(key)}]`);
    return runInContext(expression, createContext({ needs, cancelled: () => cancelled }), { timeout: 100 });
  };
  it("retains the required nested node / check with default-on behavior for consumers", () => {
    expect(workflow.jobs.node!.uses).toBe("./.github/workflows/node-ci.yml");
    expect(workflow.jobs.node!.needs).toBe("changes");
    expect(reusable.on.workflow_call.inputs["run-check"]?.default).toBe(true);
    expect(reusable.jobs.check!.if).toBe("${{ inputs.run-check }}");
    for (const name of ["pm", "pr", "agent-review"]) expect(workflow.jobs[name]!.needs).toBeUndefined();
  });
  it("fails safe on detector failure and missing/unknown flags, but honors verified skips and cancellation", () => {
    for (const result of ["success", "failure", "skipped", "cancelled"]) for (const flag of ["true", "false", "", undefined, "unexpected"]) {
      const needs = { changes: { result, outputs: { node: flag, browser: flag, bridge: flag, artifacts: flag } } };
      const expected = result !== "success" || flag !== "false";
      expect(evaluate(workflow.jobs.node!.if!, needs)).toBe(true);
      expect(evaluate(workflow.jobs.node!.with!["run-check"] as string, needs)).toBe(expected);
      for (const name of ["qa-browser", "codex-claude", "artifact-abi"]) {
        expect(evaluate(workflow.jobs[name]!.if!, needs), `${name}/${result}/${flag}`).toBe(expected);
        expect(evaluate(workflow.jobs[name]!.if!, needs, true)).toBe(false);
      }
    }
  });
});
