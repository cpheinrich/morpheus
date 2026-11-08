import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runContextSearch, runTaskRead } from "../src/cli/context-search.js";
import { CONTEXT_SEARCH_HEADER } from "../src/context-search/output.js";
import { contextArm } from "../src/context-search/rollout.js";
import { taskPrompt } from "../src/context-search/task-start.js";
import { refresh } from "../src/session/context.js";
import { gate } from "../src/session/gate.js";
import { projectRoot, recordRead } from "../src/session/read-hook.js";

const dirs: string[] = [];
const decision = "The release authority is the signed deployment record.";
const core = "Review project rules before making a change.";

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-task-context-")));
  dirs.push(root);
  await mkdir(join(root, ".agent"));
  await writeFile(join(root, ".gitignore"), "local/\n");
  await writeFile(join(root, "CLAUDE.md"), "Do project work in an isolated checkout.\n");
  await writeFile(join(root, ".agent/context-core.md"), core + "\n");
  await writeFile(join(root, ".agent/decisions.md"), decision + "\n");
  await writeFile(join(root, "morpheus.json"), JSON.stringify({
    context: { search: { rollout: { id: "task-start-test", coreInputs: [".agent/context-core.md"] } } },
  }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Project");
  git("remote", "add", "origin", root);
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const sessions = new Map<string, string>();
  for (let index = 0; sessions.size < 3 && index < 200; index++) {
    const id = "task-provider-" + index;
    const { arm } = await contextArm(root, id);
    sessions.set(arm, id);
  }
  return { root, bounded: sessions.get("ripgrep-bounded")!, full: sessions.get("ripgrep-full")! };
}

function prompt(root: string, session: string, text = "Change the release authority.") {
  return taskPrompt(JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: session, cwd: root, prompt: text }), projectRoot);
}

function shown(root: string, session: string, output: string) {
  return recordRead(JSON.stringify({
    hook_event_name: "PostToolUse", turn_id: "turn", session_id: session, cwd: root,
    tool_name: "Bash", tool_response: { output },
  }));
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("task context on bounded startup", () => {
  it("cues once and refuses a governed action until a real search result was shown", async () => {
    const { root, bounded } = await fixture();
    vi.stubEnv("MORPHEUS_CONTEXT_SESSION_ID", bounded);
    expect(await prompt(root, bounded, " ")).toBeUndefined();
    expect(await prompt(root, bounded)).toContain('morpheus context search "<task terms>"');
    expect(await prompt(root, bounded)).toBeUndefined();
    const check = () => gate(root, "pm new", "local");
    expect((await check()).message).toContain("No context receipt");

    await shown(root, bounded, "Do project work in an isolated checkout.\n" + core + "\n");
    expect((await refresh(root)).lease?.status).toBe("fresh");
    await shown(root, bounded, "No matching excerpts within the return budget.");
    expect((await check()).message).toContain("Load context for the task before continuing");
    await shown(root, bounded, `${CONTEXT_SEARCH_HEADER}\n.agent/context-core.md:1-1\n${core}\n`);
    await shown(root, bounded, `${CONTEXT_SEARCH_HEADER}\n.agent/decisions.md:1-1\nThe release authority\n`);
    expect((await check()).message).toContain("Load context for the task before continuing");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await runContextSearch(root, "signed deployment record", { json: false, sessionId: bounded })).toBe(0);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain(decision);
    expect((await check()).message).toContain("Load context for the task before continuing");
    await shown(root, "another-session", output);
    expect((await check()).message).toContain("Load context for the task before continuing");

    await shown(root, bounded, output);
    expect(await check()).toEqual({ ok: true, message: "" });
  });

  it("keeps full startup on the old gate and accepts an exact-path read in a bounded session", async () => {
    const { root, bounded, full } = await fixture();
    vi.stubEnv("MORPHEUS_CONTEXT_SESSION_ID", full);
    expect(await prompt(root, full)).toBeUndefined();
    await shown(root, full, "tool hook is active");
    expect((await gate(root, "pm new", "local")).message).toContain("No context receipt");

    vi.stubEnv("MORPHEUS_CONTEXT_SESSION_ID", bounded);
    await prompt(root, bounded);
    await shown(root, bounded, "tool hook is active");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runTaskRead(root, [".agent/context-core.md"], bounded)).rejects.toThrow("outside the required startup core");
    expect(await runTaskRead(root, [".agent/decisions.md"], bounded)).toBe(0);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toBe(`${CONTEXT_SEARCH_HEADER}\n.agent/decisions.md:1-1\n${decision}`);
    await shown(root, bounded, output);
    expect((await gate(root, "pm new", "local")).message).toContain("No context receipt");
  });
});
