import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
  vi.unstubAllEnvs();
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
    const path = await installSkill("verify");
    await writeFile(join(root, "verify", ".gstack-owned"), "/gstack-source\n");
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

  it("uses the prefixed Claude invocation name when the render declares a short name", async () => {
    const path = await installSkill("gstack-verify", "verify");
    await writeFile(join(root, "gstack-verify", ".gstack-owned"), "/gstack-source\n");
    const { routes } = await lookup("verify", "cli", "--gstack", "--host", "claude");
    expect(routes.map((route: { installed: unknown }) => route.installed))
      .toEqual([{ name: "gstack-verify", path }]);
  });

  it("does not route an unlinked Claude payload or an unrelated skill with the same short name", async () => {
    await installSkill("gstack/verify", "verify");
    await installSkill("verify");
    const { routes } = await lookup("verify", "ios", "--gstack", "--host", "claude");
    expect(routes.map((route: { installed: unknown }) => route.installed)).toEqual([null]);
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

  it("labels suggestions and fallback without implying a skill has run", async () => {
    const args = ["skills", "lifecycle"];
    const flags = ["--gstack", "--host", "codex", "--skills-dir", root];
    expect(await run([...args, "review", "web"])).toBe(0);
    expect(log).toHaveBeenCalledWith("gstack off · review · web");
    expect(await run([...args, "monitor", "ios", ...flags])).toBe(0);
    expect(log).toHaveBeenCalledWith("No gstack workflow matches this step. Continue with Morpheus.");
    expect(await run([...args, "review", "web", ...flags])).toBe(0);
    expect(log).toHaveBeenCalledWith("No matching gstack skill is installed. Continue with Morpheus.");

    log.mockClear();
    const path = await installSkill("gstack-qa-only");
    expect(await run([...args, "review", "web", ...flags])).toBe(0);
    expect(log).toHaveBeenCalledWith("gstack opted in · review · web");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Available: gstack-qa-only · ${path}`));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Tell the user which skill you use before running it"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("Continue with Morpheus"));
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

describe("managed gstack through the CLI", () => {
  async function fakeInstaller() {
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "git"), `#!/bin/sh
printf 'git %s\\n' "$1" >> "$HOME/../../../../commands"
if [ "$1" = "-C" ]; then
  if [ -f "$HOME/../../../../bad-pin" ]; then echo moved-tag; else echo e75a69c9e15164d090e080fa001dc515495ec350; fi
else
  mkdir -p "$GSTACK_ROOT/bin"
  cat > "$GSTACK_ROOT/bin/gstack-config" <<'CONFIG'
#!/bin/sh
printf 'config %s\\n' "$*" >> "$HOME/../../../../commands"
CONFIG
  chmod +x "$GSTACK_ROOT/bin/gstack-config"
fi
`, { mode: 0o700 });
    await writeFile(join(bin, "npm"), `#!/bin/sh
printf 'npm\\n' >> "$HOME/../../../../commands"
`, { mode: 0o700 });
    await writeFile(join(bin, "bash"), `#!/bin/sh
printf 'setup %s\\n' "$*" >> "$HOME/../../../../commands"
mkdir -p "$CODEX_HOME/skills/gstack-review"
printf '%s\\n' --- 'name: review' --- > "$CODEX_HOME/skills/gstack-review/SKILL.md"
`, { mode: 0o700 });

    const cache = join(root, "tools");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
    vi.stubEnv("MORPHEUS_TOOLS_DIR", cache);
    return { cache, invocations: join(cache, "commands"), badPin: join(cache, "bad-pin") };
  }

  async function managed(...args: string[]) {
    expect(await run(["skills", "lifecycle", ...args, "--json"])).toBe(0);
    return JSON.parse(log.mock.lastCall![0]);
  }

  it("keeps default and unmatched requests cold, then installs and reuses one pinned runtime", async () => {
    const { cache, invocations } = await fakeInstaller();
    expect(await managed("review", "web")).toEqual({ enabled: false, stage: "review", surface: "web", routes: [] });
    expect(await managed("monitor", "ios", "--gstack", "--host", "codex")).toEqual({
      enabled: true, stage: "monitor", surface: "ios", routes: [],
    });
    await expect(readdir(cache)).rejects.toMatchObject({ code: "ENOENT" });

    const args = ["review", "general", "--gstack", "--host", "codex"];
    const first = await managed(...args);
    expect(first.runtime.release).toBe("v1.97.0.0");
    expect(first.runtime.env.CODEX_HOME).toBe(join(first.runtime.env.HOME, ".codex"));
    expect(first.runtime.env.CLAUDE_CONFIG_DIR).toBe(join(first.runtime.env.HOME, ".claude"));
    expect(first.routes[0].installed.name).toBe("review");
    expect(first.routes[0].installed.path).toBe(join(first.runtime.env.CODEX_HOME, "skills", "gstack-review", "SKILL.md"));
    expect(await managed(...args)).toEqual(first);
    expect(await readFile(invocations, "utf8")).toBe(
      "git clone\ngit -C\nnpm\nsetup ./setup --host codex --prefix --no-team --no-harness-auto " +
      "--no-plan-tune-hooks --no-timeline-stop-hook\nconfig set update_check false\nconfig set telemetry off\n",
    );
  });

  it("rejects a moved release tag before setup and can retry without a cached partial install", async () => {
    const { cache, badPin, invocations } = await fakeInstaller();
    await mkdir(cache);
    await writeFile(badPin, "");
    const args = ["review", "general", "--gstack", "--host", "codex"];
    const failed = await managed(...args);
    expect(failed).toEqual({
      enabled: true, stage: "review", surface: "general", routes: [],
      setupError: "gstack v1.97.0.0 did not resolve to the pinned commit.",
    });
    expect(await readFile(invocations, "utf8")).toBe("git clone\ngit -C\n");
    expect(await readdir(join(cache, "gstack", "v1.97.0.0", "codex"))).toEqual([]);
    await rm(badPin);
    expect((await managed(...args)).routes[0].installed.name).toBe("review");
  });
});
