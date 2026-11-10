import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTEXT_SEARCH_HEADER } from "../src/context-search/output.js";
import { queryTerms, searchHint, searchTarget, targetsRecords } from "../src/context-search/search-hook.js";
import { projectRoot } from "../src/session/read-hook.js";

const dirs: string[] = [];
const decision = "The release authority is the signed deployment record.";

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-search-hook-")));
  dirs.push(root);
  await mkdir(join(root, ".agent"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, ".gitignore"), "local/\n");
  await writeFile(join(root, ".agent/decisions.md"), decision + "\n");
  await writeFile(join(root, "src/release.ts"), "// release authority lives in the deployment record\n");
  await writeFile(join(root, "morpheus.json"), "{}\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Project");
  return root;
}

const grep = (root: string, input: Record<string, unknown>) =>
  searchHint({ cwd: root, session_id: "hook-session", tool_name: "Grep", tool_input: input }, projectRoot);
const bash = (root: string, command: string) =>
  searchHint({ cwd: root, session_id: "hook-session", tool_name: "Bash", tool_input: { command } }, projectRoot);

describe("searchTarget", () => {
  it("reads Grep's pattern, path and Markdown filters", () => {
    expect(searchTarget("Grep", { pattern: "toggle", path: "hq/product" })).toEqual({ pattern: "toggle", paths: ["hq/product"], markdown: false });
    expect(searchTarget("Grep", { pattern: "toggle", glob: "**/*.md" })?.markdown).toBe(true);
    expect(searchTarget("Grep", { pattern: "toggle", type: "md" })?.markdown).toBe(true);
    expect(searchTarget("Grep", { pattern: "toggle", type: "ts" })?.markdown).toBe(false);
    expect(searchTarget("Read", { file_path: "x.md" })).toBeUndefined();
  });

  it("finds the search inside a shell pipeline, skipping option values", () => {
    expect(searchTarget("Bash", { command: `cd /repo && rg -n -m 5 "weight toggle" .agent/worklog hq | head -20` }))
      .toEqual({ pattern: "weight toggle", paths: [".agent/worklog", "hq"], markdown: false });
    expect(searchTarget("Bash", { command: "grep -rn --include=*.md -e 'release authority' ." }))
      .toEqual({ pattern: "release authority", paths: ["."], markdown: true });
    expect(searchTarget("Bash", { command: "rg -g '*.md' toggle" })).toEqual({ pattern: "toggle", paths: [], markdown: true });
    expect(searchTarget("Bash", { command: "git grep -n toggle -- docs" })).toEqual({ pattern: "toggle", paths: ["docs"], markdown: false });
    expect(searchTarget("Bash", { command: "rg toggle .agent/worklog/*.md" })?.markdown).toBe(true);
    expect(searchTarget("Bash", { command: "pnpm test && git status" })).toBeUndefined();
  });

  it("keeps quoted alternation in the pattern and reads grep -E as a plain option", () => {
    expect(searchTarget("Bash", { command: `rg "decision|approval" docs/` }))
      .toEqual({ pattern: "decision|approval", paths: ["docs/"], markdown: false });
    expect(searchTarget("Bash", { command: `grep -rE "foo|bar" .agent/worklog; echo done` }))
      .toEqual({ pattern: "foo|bar", paths: [".agent/worklog"], markdown: false });
    expect(searchTarget("Bash", { command: "grep -E review docs/runbooks" }))
      .toEqual({ pattern: "review", paths: ["docs/runbooks"], markdown: false });
    // An empty quoted pattern is still one word, so the path is not misread as the pattern.
    expect(searchTarget("Bash", { command: "rg -n '' docs" })).toBeUndefined();
  });
});

describe("queryTerms", () => {
  it("turns a regular expression into ranked-search words", () => {
    expect(queryTerms("unmeasured.*weight|toggle\\b")).toBe("unmeasured weight toggle");
    expect(queryTerms("MO-26-11-09")).toBe("MO-26-11-09");
    expect(queryTerms("^\\s*$")).toBe("");
  });
});

describe("targetsRecords", () => {
  const records = [".agent/decisions.md", "hq/product/roadmap/a.md"];
  it("needs every named path to hold records, and a Markdown filter for a whole-checkout search", () => {
    expect(targetsRecords([], false, records)).toBe(false);
    expect(targetsRecords([], true, records)).toBe(true);
    expect(targetsRecords([""], false, records)).toBe(false);
    expect(targetsRecords([".agent"], false, records)).toBe(true);
    expect(targetsRecords([".agent/decisions.md"], false, records)).toBe(true);
    expect(targetsRecords(["hq/product", "src"], false, records)).toBe(false);
    // A sibling whose name merely starts the same is not inside the directory.
    expect(targetsRecords([".age"], false, records)).toBe(false);
  });
});

describe("searchHint", () => {
  it("adds tagged, cited excerpts when a search aims at project records", async () => {
    const root = await fixture();
    const hint = await grep(root, { pattern: "release.*authority", path: ".agent" });
    expect(hint?.systemMessage).toBe('Morpheus Context: 1 cited excerpt(s) for "release authority" added to this search.');
    expect(hint?.additionalContext).toMatch(/^\[morpheus-context\] Morpheus Context search found 1 cited excerpt\(s\)/);
    expect(hint?.additionalContext).toContain("search_project_context");
    expect(hint?.additionalContext).toContain(`${CONTEXT_SEARCH_HEADER}\n.agent/decisions.md:1-1\n${decision}`);
    const shell = await bash(root, `rg -n "release authority" ${join(root, ".agent/decisions.md")}`);
    expect(shell?.additionalContext).toContain(decision);
  });

  it("stays silent for code, whole-checkout and outside searches", async () => {
    const root = await fixture();
    expect(await grep(root, { pattern: "release authority", path: "src" })).toBeUndefined();
    expect(await grep(root, { pattern: "release authority" })).toBeUndefined();
    expect(await bash(root, "rg 'release authority' src .agent")).toBeUndefined();
    expect(await grep(root, { pattern: "release authority", path: "../" })).toBeUndefined();
    expect(await grep(root, { pattern: "**", path: ".agent" })).toBeUndefined();
  });

  it("still points to the MCP when no record matches", async () => {
    const root = await fixture();
    const hint = await grep(root, { pattern: "zeppelin", glob: "*.md" });
    expect(hint).toEqual({
      additionalContext: '[morpheus-context] No indexed project record matched "zeppelin". For project records prefer the Morpheus Context MCP tools search_project_context and read_project_record over grep.',
      systemMessage: 'Morpheus Context: no project-record excerpt for "zeppelin".',
    });
  });
});
