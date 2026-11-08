import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";

let root: string;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "gstack-lifecycle-"));
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function installSkill(directory: string, name = directory): Promise<string> {
  const dir = join(root, directory);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  await writeFile(path, `---\nname: ${name}\ndescription: Fixture\n---\n# Fixture\n`);
  return path;
}

async function lookup(stage: string, surface: string, ...flags: string[]) {
  expect(await run(["skills", "lifecycle", stage, surface, "--skills-dir", root, "--json", ...flags])).toBe(0);
  return JSON.parse(log.mock.lastCall![0]);
}

describe("gstack lifecycle routing through the CLI", () => {
  it("does no discovery when off, even with a malformed candidate", async () => {
    await installSkill("gstack-review", "wrong-skill");
    expect(await lookup("review", "web")).toEqual({
      enabled: false, stage: "review", surface: "web", routes: [],
    });
  });

  it("discovers native Codex symlinks and returns exact evidence destinations", async () => {
    await installSkill("rendered-review", "review");
    await symlink(join(root, "rendered-review"), join(root, "gstack-review"));
    const qa = await installSkill("gstack-qa-only");
    const { routes } = await lookup("review", "web", "--gstack", "--host", "codex");
    expect(routes).toEqual([
      {
        skill: "review",
        installed: { name: "review", path: join(root, "gstack-review", "SKILL.md") },
        provide: "Exact diff and acceptance criteria. Apply edits only within the current task's authority.",
        returnToMorpheus: "Include findings and dispositions in the independent review packet.",
      },
      {
        skill: "qa-only",
        installed: { name: "gstack-qa-only", path: qa },
        provide: "Changed flows and a runnable, authorized web preview or isolated CLI target.",
        returnToMorpheus: "Include reproducible findings and evidence paths in the independent review packet.",
      },
    ]);
  });

  it("discovers Claude short-name skills and distinguishes a missing install", async () => {
    const path = await installSkill("gstack/verify", "verify");
    const flags = ["--gstack", "--host", "claude"];
    expect((await lookup("verify", "ios", ...flags)).routes.map((route: { installed: unknown }) => route.installed))
      .toEqual([{ name: "verify", path }]);
    expect((await lookup("plan", "ios", ...flags)).routes).toEqual([{
      skill: "autoplan",
      installed: null,
      provide: "Claimed task brief, worktree, acceptance, and open decisions.",
      returnToMorpheus: "Link the amended plan, test plan, and open decisions in the task worklog.",
    }]);
  });

  it("only suggests canary for web monitoring", async () => {
    const path = await installSkill("gstack-canary");
    const flags = ["--gstack", "--host", "codex"];
    expect((await lookup("monitor", "ios", ...flags)).routes).toEqual([]);
    expect((await lookup("monitor", "cli", ...flags)).routes).toEqual([]);
    expect((await lookup("monitor", "web", ...flags)).routes).toEqual([{
      skill: "canary",
      installed: { name: "gstack-canary", path },
      provide: "Authorized web URL, release identity, baseline, and observation deadline.",
      returnToMorpheus: "Return observations and evidence to the existing release owner.",
    }]);
  });

  it("rejects invalid names and option spelling instead of silently opting in", async () => {
    await installSkill("gstack-review", "wrong-skill");
    await expect(lookup("review", "web", "--gstack", "--host", "codex")).rejects.toThrow(
      "Unexpected gstack skill name",
    );
    await expect(lookup("review", "web", "--gstak")).rejects.toThrow("Unknown option '--gstak'");
    await expect(lookup("review", "web", "--gstack")).rejects.toThrow("--host must be codex or claude");
  });
});
