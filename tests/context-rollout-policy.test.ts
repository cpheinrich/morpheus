import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contextArm, parseSearchConfig, providerSessionId, traceContext } from "../src/context-search/rollout.js";
import { searchStateDirectory } from "../src/context-search/local-state.js";
import { runnerSession, sessionTag } from "../src/session/evidence.js";
import { projectPolicy } from "../src/session/policy.js";

const cleanup: string[] = [];

async function fixture(core = ".agent/core.md"): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-rollout-test-")));
  cleanup.push(root);
  await mkdir(join(root, ".agent"));
  await writeFile(join(root, ".agent/core.md"), "Read the release rule before shipping.");
  await writeFile(join(root, "morpheus.json"), JSON.stringify({ context: {
    handle: "operator",
    requiredInputs: ["docs/guard.md", "hq/team/operator.md"],
    search: { rollout: { id: "pilot", coreInputs: [core] } },
  }}));
  return root;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("context rollout", () => {
  it("honors the printed hook identity when the shell reports a different provider ID", () => {
    const env = { CODEX_THREAD_ID: "different-shell-id", MORPHEUS_CONTEXT_SESSION_ID: "hook-session-id" };
    expect(providerSessionId(env)).toBe("hook-session-id");
    expect(providerSessionId({ CODEX_THREAD_ID: "native" })).toBe("native");
    expect(runnerSession({ CODEX_THREAD_ID: "native" })).toEqual({ provider: "codex", tag: sessionTag("native") });
    expect(runnerSession(env)).toEqual({ provider: "codex", tag: sessionTag("hook-session-id") });
  });

  it("keeps approved compact startup for every session regardless of the old engine setting", async () => {
    const root = await fixture();
    const manifest = join(root, "morpheus.json");
    const config = JSON.parse(await readFile(manifest, "utf8"));
    config.context.search.mode = "ripgrep";
    await writeFile(manifest, JSON.stringify(config));
    for (const session of ["provider-private-id-0", "provider-private-id-79", "provider-private-id-99"]) {
      expect(await contextArm(root, session)).toMatchObject({ engine: "tantivy", startup: "bounded", arm: "tantivy-bounded" });
      expect((await projectPolicy(root, session)).requiredInputs).toEqual(["CLAUDE.md", ".agent/core.md", "docs/guard.md"]);
    }
    expect((await projectPolicy(root, "")).requiredInputs).toEqual(["CLAUDE.md", ".agent/decisions.md", ".agent/learned.md", "docs/guard.md"]);
  });

  it("fails to full reads if a core file escapes via a symlink or no provider is available", async () => {
    const root = await fixture();
    const path = join(root, ".agent/core.md");
    await rm(path);
    await symlink(join(root, "morpheus.json"), path);
    expect((await projectPolicy(root, "provider")).requiredInputs).toEqual([
      "CLAUDE.md", ".agent/decisions.md", ".agent/learned.md", "docs/guard.md",
    ]);
    expect((await contextArm(root, "")).startup).toBe("full");
    expect(() => parseSearchConfig({ rollout: { id: "pilot", coreInputs: ["../secret.md"] } })).toThrow("safe Markdown files");
  });

  it("retains only allowlisted telemetry in private ignored workspace storage", async () => {
    const root = await fixture();
    execFileSync("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, ".gitignore"), "/local/\n");
    const selected = await contextArm(root, "provider");
    const event = { type: "query" as const, arm: selected.arm, engine: selected.engine,
      rollout: selected.id, session: selected.session, queryMs: 12, resultCount: 3,
      query: "private prompt", excerpt: "private source" };
    await traceContext(root, event, new Date("2026-11-07T12:00:00Z"));
    const trace = JSON.parse(await readFile(join(root, "local/context-search/traces/2026-11-07.jsonl"), "utf8"));
    expect(trace).toEqual({
      version: 1, at: "2026-11-07T12:00:00.000Z", type: "query", arm: "tantivy-bounded",
      engine: "tantivy", rollout: "pilot", session: selected.session, queryMs: 12, resultCount: 3,
    });
  });

  it("refuses storage that could be committed or leave the worktree", async () => {
    const root = await fixture();
    execFileSync("git", ["init", "-q"], { cwd: root });
    await expect(searchStateDirectory(root, "cache")).rejects.toThrow("ignored");
    await writeFile(join(root, ".gitignore"), "/local/\n");
    await mkdir(join(root, "local"));
    await mkdir(join(root, "local", "context-search"));
    await symlink(join(root, ".agent"), join(root, "local", "context-search", "cache"));
    await expect(searchStateDirectory(root, "cache")).rejects.toThrow("inside the worktree");
  });

});
