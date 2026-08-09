import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseOnboarding, renderOnboarding, setState, type TaskStatus } from "../src/onboarding/state.js";
import { collectStatus, summarise } from "../src/onboarding/status.js";
import { TASKS, projectLabel, tasksFor, type Task } from "../src/onboarding/tasks.js";
import { appendOpenItem } from "../src/inbox/append.js";
import { TEAM_RESERVED } from "../src/paths.js";

const task = (over: Partial<Task> = {}): Task => ({
  id: "cloudflare-token",
  title: "Cloudflare API token issued and stored",
  why: "So no agent has to ask you to make one.",
  how: "Cloudflare → My Profile → API Tokens",
  group: "Infrastructure",
  ...over,
});

const status = (over: Partial<TaskStatus> = {}): TaskStatus => ({
  task: task(),
  state: "todo",
  detected: false,
  ...over,
});

describe("the checklist catalogue", () => {
  it("has a unique id for every task", () => {
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tells you how to do every task", () => {
    for (const t of TASKS) expect(t.how.length).toBeGreaterThan(10);
  });

  it("does not ask an internal tool for a brand or a billing account", () => {
    const ids = tasksFor("internal").map((t) => t.id);

    expect(ids).not.toContain("brand-answers");
    expect(ids).not.toContain("gcp-billing");
    expect(ids).toContain("manifest");
  });

  it("asks a company for everything", () => {
    expect(tasksFor("company").length).toBe(TASKS.length);
  });
});

describe("persistence across interruptions", () => {
  it("round-trips a hand-set checkbox", () => {
    const md = renderOnboarding("Evo", [status({ state: "in-progress" })], "company");
    const back = parseOnboarding(md);

    expect(back.get("cloudflare-token")?.state).toBe("in-progress");
  });

  it("preserves a note written under a task", () => {
    const note = "Blocked: waiting on Chris for the zone id.";
    const md = renderOnboarding("Evo", [status({ state: "in-progress", note })], "company");

    expect(parseOnboarding(md).get("cloudflare-token")?.note).toBe(note);
  });

  it("reads every checkbox form", () => {
    const md = [
      "<!-- morpheus:task a -->",
      "- [x] Done thing",
      "<!-- morpheus:task b -->",
      "- [~] Half-done thing",
      "<!-- morpheus:task c -->",
      "- [ ] Not started",
    ].join("\n");
    const back = parseOnboarding(md);

    expect(back.get("a")?.state).toBe("done");
    expect(back.get("b")?.state).toBe("in-progress");
    expect(back.get("c")?.state).toBe("todo");
  });

  it("ignores prose before the first anchor", () => {
    const md = "# Heading\n\n- [x] Not a task, just prose.\n\n<!-- morpheus:task a -->\n- [ ] Real\n";

    expect(parseOnboarding(md).has("a")).toBe(true);
    expect(parseOnboarding(md).size).toBe(1);
  });
});

describe("projectLabel", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "label-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const manifest = (m: Record<string, unknown>) =>
    writeFile(join(dir, "morpheus.json"), JSON.stringify(m));

  it("prefers displayName, which is the human-facing one", async () => {
    await manifest({ displayName: "Morpheus", name: "morpheus" });
    expect(await projectLabel(dir)).toBe("Morpheus");
  });

  it("falls back to name when there is no displayName", async () => {
    await manifest({ name: "morpheus" });
    expect(await projectLabel(dir)).toBe("morpheus");
  });

  // The manifest travels with the repo; the directory does not. A worktree for
  // MO-044 sits in `morpheus-mo-044`, and the heading must not follow it.
  it("does not use the directory name when the manifest declares one", async () => {
    await manifest({ displayName: "Morpheus" });
    expect(await projectLabel(dir)).not.toContain("label-");
  });

  it("ignores an empty declaration rather than rendering a blank heading", async () => {
    await manifest({ displayName: "  ", name: "morpheus" });
    expect(await projectLabel(dir)).toBe("morpheus");
  });

  it("falls back to the directory when there is no manifest at all", async () => {
    expect(await projectLabel(dir)).toBe(basename(dir));
  });
});

describe("detection outranks the file, except when it cannot answer", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "onboard-"));
    await writeFile(
      join(dir, "morpheus.json"),
      JSON.stringify({ name: "Evo", prefix: "EV", kind: "company" }),
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("overrides a hand-ticked box for something it can see is false", async () => {
    await mkdir(join(dir, "hq"), { recursive: true });
    await writeFile(
      join(dir, "hq/onboarding.md"),
      "<!-- morpheus:task agents-md -->\n- [x] AGENTS.md\n",
    );

    const found = await collectStatus(dir, { offline: true });
    const agents = found.find((s) => s.task.id === "agents-md");

    // There is no AGENTS.md in this temp dir. The file said otherwise.
    expect(agents?.state).toBe("todo");
    expect(agents?.detected).toBe(true);
  });

  it("keeps a manual state it has no way to check", async () => {
    await mkdir(join(dir, "hq"), { recursive: true });
    await writeFile(
      join(dir, "hq/onboarding.md"),
      "<!-- morpheus:task domain -->\n- [x] Domain registered\n",
    );

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "domain")?.state).toBe("done");
  });

  it("does not accept an empty goal file as a written goal", async () => {
    await mkdir(join(dir, "hq/product/goals"), { recursive: true });
    await writeFile(join(dir, "hq/product/goals/EV-G-2026-Q3-01.md"), "");

    const found = await collectStatus(dir, { offline: true });
    // Existence is not the step being done — the same mistake tokens.json had.
    expect(found.find((s) => s.task.id === "goal")?.state).toBe("todo");
  });

  it("does not accept an inbox that would fail its own validator", async () => {
    await mkdir(join(dir, "hq/team"), { recursive: true });
    await writeFile(join(dir, "hq/team/cpheinrich.md"), "# Just a heading\n");

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "inbox")?.state).toBe("todo");
  });

  /**
   * `hq/team/` is not a folder of inboxes — it is a folder of collaborative
   * context, and the roster and the folder README live in it too. A detector
   * that requires *every* `.md` to parse as an inbox therefore unticks a
   * finished step the moment a project writes one, which is what happened to
   * heinrichbros.com the hour after its roster landed.
   *
   * Written against `TEAM_RESERVED` rather than the two names in it today: the
   * bug was a hand-written filter drifting from the shared set, so a test that
   * hard-codes the same names would drift with it.
   */
  it("ignores every reserved file when looking for an inbox", async () => {
    await mkdir(join(dir, "hq/team"), { recursive: true });
    await writeFile(
      join(dir, "hq/team/cpheinrich.md"),
      appendOpenItem(
        null,
        { title: "A question", agent: "claude", body: "Body." },
        { owner: "cpheinrich", date: "2026-08-05" },
      ),
    );
    for (const reserved of TEAM_RESERVED) {
      // Deliberately not parseable as an inbox — that is the whole point.
      await writeFile(join(dir, "hq/team", reserved), "---\nmembers: []\n---\n\n# Not an inbox\n");
    }

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "inbox")?.state).toBe("done");
  });

  it("accepts a goal that actually parses", async () => {
    await mkdir(join(dir, "hq/product/goals"), { recursive: true });
    await writeFile(
      join(dir, "hq/product/goals/EV-G-2026-Q3-01.md"),
      [
        "---",
        "id: EV-G-2026-Q3-01",
        "title: Ship the first version",
        "horizon: quarterly",
        "period: 2026-Q3",
        "metric: One paying user",
        "target: 1",
        "status: on-track",
        "created: 2026-07-01",
        "updated: 2026-07-01",
        "---",
        "",
        "Body.",
      ].join("\n"),
    );

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "goal")?.state).toBe("done");
  });

  it("does not accept two divergent instruction files as a symlink", async () => {
    await writeFile(join(dir, "AGENTS.md"), "# Agents\n");
    await writeFile(join(dir, "CLAUDE.md"), "# Claude, separately and already drifting\n");

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "agents-md")?.state).toBe("todo");
  });

  it("accepts a real symlink", async () => {
    const { symlink } = await import("node:fs/promises");
    await writeFile(join(dir, "AGENTS.md"), "# Agents\n");
    await symlink("AGENTS.md", join(dir, "CLAUDE.md"));

    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "agents-md")?.state).toBe("done");
  });

  it("detects a real manifest", async () => {
    const found = await collectStatus(dir, { offline: true });
    expect(found.find((s) => s.task.id === "manifest")?.state).toBe("done");
  });

  it("never counts a skipped network check as not done", async () => {
    const found = await collectStatus(dir, { offline: true });
    const protection = found.find((s) => s.task.id === "branch-protection");

    // Offline means unasked, not unprotected.
    expect(protection?.detected).toBe(false);
  });
});

describe("marking tasks by hand", () => {
  it("refuses to mark a detected task, and says why", () => {
    const statuses = [status({ task: task({ id: "manifest" }), detected: true })];
    const r = setState(statuses, "manifest", "done");

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/would not survive/);
  });

  it("marks a manual task", () => {
    const statuses = [status()];
    expect(setState(statuses, "cloudflare-token", "done").ok).toBe(true);
    expect(statuses[0]!.state).toBe("done");
  });

  it("points at the list when the id is wrong", () => {
    expect(setState([status()], "nope", "done").reason).toMatch(/init status/);
  });
});

describe("summary", () => {
  it("counts optional work separately so it cannot block completion", () => {
    const s = summarise([
      status({ state: "done" }),
      status({ task: task({ id: "analytics", optional: true }), state: "todo" }),
    ]);

    expect(s.complete).toBe(true);
    expect(s.optionalDone).toBe(0);
  });
});
