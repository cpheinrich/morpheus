import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { armForBucket, contextArm, parseSearchConfig, providerSessionId, traceContext } from "../src/context-search/rollout.js";
import { runnerSession, sessionTag } from "../src/session/evidence.js";
import { projectPolicy } from "../src/session/policy.js";

const cleanup: string[] = [];

async function fixture(core = ".agent/core.md"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-rollout-test-"));
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

async function findArm(root: string, arm: "tantivy-bounded" | "ripgrep-bounded" | "ripgrep-full") {
  for (let i = 0; i < 200; i++) {
    const id = "provider-private-id-" + i;
    const selected = await contextArm(root, id);
    if (selected.arm === arm) return { id, selected };
  }
  throw new Error("fixture produced no matching arm");
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("context rollout", () => {
  it("assigns 60/20/20 buckets with exact boundaries", () => {
    expect([0,59,60,79,80,99].map(armForBucket)).toEqual([
      "tantivy-bounded","tantivy-bounded","ripgrep-bounded","ripgrep-bounded","ripgrep-full","ripgrep-full",
    ]);
  });

  it("honors the printed hook identity when the shell reports a different provider ID", () => {
    const env = { CODEX_THREAD_ID: "different-shell-id", MORPHEUS_CONTEXT_SESSION_ID: "hook-session-id" };
    expect(providerSessionId(env)).toBe("hook-session-id");
    expect(providerSessionId({ CODEX_THREAD_ID: "native" })).toBe("native");
    expect(runnerSession({ CODEX_THREAD_ID: "native" })).toEqual({ provider: "codex", tag: sessionTag("native") });
    expect(runnerSession(env)).toEqual({ provider: "codex", tag: sessionTag("hook-session-id") });
  });

  it("retains a session's arm and reads the distinct required sets without human inboxes", async () => {
    const root = await fixture();
    const bounded = await findArm(root, "tantivy-bounded");
    const full = await findArm(root, "ripgrep-full");
    expect(await contextArm(root, bounded.id)).toEqual(bounded.selected);
    expect((await projectPolicy(root, bounded.id)).requiredInputs).toEqual(["CLAUDE.md", ".agent/core.md", "docs/guard.md"]);
    expect((await projectPolicy(root, full.id)).requiredInputs).toEqual(["CLAUDE.md", ".agent/decisions.md", ".agent/learned.md", "docs/guard.md"]);
  });

  it("fails to full reads if a core file escapes via a symlink or no provider is available", async () => {
    const root = await fixture();
    const bounded = await findArm(root, "ripgrep-bounded");
    const path = join(root, ".agent/core.md");
    await rm(path);
    await symlink(join(root, "morpheus.json"), path);
    expect((await projectPolicy(root, bounded.id)).requiredInputs).toEqual([
      "CLAUDE.md", ".agent/decisions.md", ".agent/learned.md", "docs/guard.md",
    ]);
    expect((await contextArm(root, "")).startup).toBe("full");
    expect(() => parseSearchConfig({ rollout: { id: "pilot", coreInputs: ["../secret.md"] } })).toThrow("safe Markdown files");
  });

  it("retains only allowlisted telemetry in private common Git storage", async () => {
    const root = await fixture();
    execFileSync("git", ["init", "-q"], { cwd: root });
    const selected = (await findArm(root, "tantivy-bounded")).selected;
    const event = { type: "query" as const, arm: selected.arm, engine: selected.engine,
      rollout: selected.id, session: selected.session, queryMs: 12, resultCount: 3,
      query: "private prompt", excerpt: "private source" };
    await traceContext(root, event, new Date("2026-11-07T12:00:00Z"));
    const trace = JSON.parse(await readFile(join(root, ".git/morpheus-context-traces/2026-11-07.jsonl"), "utf8"));
    expect(trace).toEqual({
      version: 1, at: "2026-11-07T12:00:00.000Z", type: "query", arm: "tantivy-bounded",
      engine: "tantivy", rollout: "pilot", session: selected.session, queryMs: 12, resultCount: 3,
    });
  });
});
