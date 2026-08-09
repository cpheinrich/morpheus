import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { block, BlockError, unblock } from "../src/pm/block.js";
import { block as blockCli } from "../src/cli/pm.js";
import { updateFrontmatter } from "../src/pm/frontmatter.js";
import { appendOpenItem, lastItemNumber } from "../src/inbox/append.js";
import { parseInbox } from "../src/inbox/parse.js";
import { parseArtifact } from "../src/pm/parse.js";
import { RoadmapItem } from "../src/pm/schema.js";

let root: string;
let product: string;

const ITEM = `id: MO-051
title: Agent code review
status: in-progress
priority: P1
owner: agent
prs: []
created: 2026-07-01
updated: 2026-07-28`;

async function seedItem(frontmatter = ITEM, id = "MO-051", file = `${id}.md`) {
  const dir = join(product, "roadmap");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), `---\n${frontmatter}\n---\n\n## Context\n\nBody.\n`);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morpheus-block-"));
  product = join(root, "hq/product");
});

describe("the blocked refinement", () => {
  const base = {
    id: "MO-051",
    title: "Agent code review",
    priority: "P1",
    created: "2026-07-01",
    updated: "2026-07-28",
  };

  it("accepts blocked when needs says something", () => {
    const r = RoadmapItem.safeParse({ ...base, status: "blocked", needs: "which model" });
    expect(r.success).toBe(true);
  });

  // The verifier half: "I am blocked" with no unblocker is a crash with
  // better manners, and this is the check that refuses it.
  it("rejects blocked with no needs at all", () => {
    const r = RoadmapItem.safeParse({ ...base, status: "blocked" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("needs");
  });

  it("rejects blocked with a whitespace-only needs", () => {
    const r = RoadmapItem.safeParse({ ...base, status: "blocked", needs: "   " });
    expect(r.success).toBe(false);
  });

  it("leaves every other status free of the requirement", () => {
    for (const status of ["backlog", "in-progress", "review", "shipped", "dropped"]) {
      expect(RoadmapItem.safeParse({ ...base, status }).success).toBe(true);
    }
  });
});

describe("updateFrontmatter", () => {
  const raw = `---\nid: MO-051\nstatus: in-progress\nupdated: 2026-07-28\n---\n\nBody.\n`;

  it("replaces an existing field in place", () => {
    expect(updateFrontmatter(raw, { status: "blocked" })).toContain("status: blocked");
  });

  it("appends a field that was not there", () => {
    const out = updateFrontmatter(raw, { needs: "which model" });
    expect(out).toMatch(/needs: "?which model"?/);
    // Inside the block, not in the body.
    expect(out.indexOf("needs:")).toBeLessThan(out.lastIndexOf("---"));
  });

  it("removes a field when given null", () => {
    const withNeeds = updateFrontmatter(raw, { needs: "x" });
    expect(updateFrontmatter(withNeeds, { needs: null })).not.toContain("needs:");
  });

  it("quotes a value containing a colon, which would otherwise break YAML", () => {
    const out = updateFrontmatter(raw, { needs: "decide: which model" });
    expect(out).toContain('needs: "decide: which model"');
  });

  it("leaves the body untouched", () => {
    expect(updateFrontmatter(raw, { status: "blocked" })).toContain("\nBody.\n");
  });

  it("returns the input unchanged when there is no frontmatter", () => {
    expect(updateFrontmatter("no frontmatter here", { status: "blocked" })).toBe(
      "no frontmatter here",
    );
  });
});

describe("appendOpenItem", () => {
  const meta = { owner: "cpheinrich", date: "2026-08-01" };
  const item = {
    title: "Blocked: Agent code review",
    agent: "claude" as const,
    roadmap: "MO-051",
    body: "Needs a model credential.",
  };

  it("creates a valid inbox when the person has none", () => {
    const out = appendOpenItem(null, item, meta);
    const parsed = parseInbox("cpheinrich.md", out);

    expect(parsed.issues).toEqual([]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.state).toBe("open");
    expect(parsed.items[0]!.hasReplySlot).toBe(true);
    // Validation requires prose before the first item; a file born without it
    // is a file born failing CI.
    expect(parsed.summary.length).toBeGreaterThan(0);
  });

  it("numbers densely after the existing items", () => {
    const first = appendOpenItem(null, item, meta);
    const second = appendOpenItem(first, { ...item, title: "Blocked: something else" }, meta);
    const parsed = parseInbox("cpheinrich.md", second);

    expect(parsed.items.map((i) => i.n)).toEqual([1, 2]);
    expect(parsed.issues).toEqual([]);
  });

  it("carries the roadmap id as a link that resolves on GitHub", () => {
    const out = appendOpenItem(null, item, meta);
    expect(out).toContain("[MO-051](../product/roadmap/MO-051.md)");
    expect(parseInbox("cpheinrich.md", out).items[0]!.roadmap).toBe("MO-051");
  });

  it("uses the real roadmap filename when it carries a slug", () => {
    const out = appendOpenItem(
      null,
      { ...item, roadmapFile: "MO-051-agent-code-review.md" },
      meta,
    );
    expect(out).toContain(
      "[MO-051](../product/roadmap/MO-051-agent-code-review.md)",
    );
  });

  it("omits the roadmap tail when there is no id", () => {
    const { roadmap: _drop, ...noId } = item;
    const out = appendOpenItem(null, noId, meta);
    expect(out).not.toContain("../product/roadmap/");
  });

  // The live inbox is usually mid-cycle and *invalid* — the human has replied
  // inline and consumed a `~`. Refusing to append then would make blocking
  // unavailable at exactly the time it is needed.
  it("appends to an inbox that currently fails validation", () => {
    const replied = appendOpenItem(null, item, meta).replace(/^~$/m, "~ go ahead");
    expect(parseInbox("x.md", replied).issues.length).toBeGreaterThan(0);

    const out = appendOpenItem(replied, { ...item, title: "Blocked: a second thing" }, meta);
    expect(lastItemNumber(out)).toBe(2);
  });

  it("treats an empty file as no inbox at all", () => {
    expect(appendOpenItem("   \n", item, meta)).toContain("owner: cpheinrich");
  });
});

describe("lastItemNumber", () => {
  it("is 0 for a document with no items", () => {
    expect(lastItemNumber("# Inbox\n\nSome prose.\n")).toBe(0);
  });

  it("takes the maximum rather than the last seen", () => {
    expect(lastItemNumber("## ❗ 3. c\n## ✅ 1. a\n")).toBe(3);
  });

  it("counts done items too, so numbering never collides", () => {
    expect(lastItemNumber("## ✅ 7. done\n")).toBe(7);
  });
});

describe("block", () => {
  const opts = () => ({
    productDir: product,
    root,
    id: "MO-051",
    needs: "which model, and whose subscription pays for it",
    owner: "cpheinrich",
  });

  it("writes all three records and refreshes the generated index", async () => {
    await seedItem();
    const r = await block(opts());

    expect(r.written).toHaveLength(4);
    expect(r.inboxCreated).toBe(true);

    const item = await readFile(join(product, "roadmap/MO-051.md"), "utf8");
    expect(item).toContain("status: blocked");
    expect(item).toContain("whose subscription pays for it");

    const worklog = await readFile(r.written[1]!, "utf8");
    expect(worklog).toContain("outcome: blocked");
    expect(worklog).toContain("roadmap: MO-051");

    const inbox = await readFile(join(root, "hq/team/cpheinrich.md"), "utf8");
    expect(inbox).toContain("Blocked: Agent code review");

    const index = await readFile(join(product, "roadmap/README.md"), "utf8");
    expect(index).toContain("| blocked |");
  });

  it("leaves the board valid — a blocked item still parses", async () => {
    await seedItem();
    await block(opts());

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toEqual([]);
    expect(items[0]!.data.status).toBe("blocked");
    expect(items[0]!.data.needs).toContain("which model");
  });

  it("leaves the inbox valid, so blocking cannot red CI", async () => {
    await seedItem();
    await block(opts());

    const raw = await readFile(join(root, "hq/team/cpheinrich.md"), "utf8");
    expect(parseInbox("cpheinrich.md", raw).issues).toEqual([]);
  });

  it("appends to an existing inbox rather than replacing it", async () => {
    await seedItem();
    await mkdir(join(root, "hq/team"), { recursive: true });
    const existing = appendOpenItem(
      null,
      { title: "An earlier question", agent: "claude", body: "Body." },
      { owner: "cpheinrich", date: "2026-07-30" },
    );
    await writeFile(join(root, "hq/team/cpheinrich.md"), existing);

    const r = await block(opts());
    expect(r.inboxCreated).toBe(false);

    const raw = await readFile(join(root, "hq/team/cpheinrich.md"), "utf8");
    const parsed = parseInbox("cpheinrich.md", raw);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]!.title).toBe("An earlier question");
    expect(parsed.issues).toEqual([]);
  });

  it("refuses an empty needs", async () => {
    await seedItem();
    await expect(block({ ...opts(), needs: "   " })).rejects.toThrow(BlockError);
  });

  it("refuses an item that shipped", async () => {
    await seedItem(ITEM.replace("status: in-progress", "status: shipped"));
    await expect(block(opts())).rejects.toThrow(/shipped/);
  });

  it("refuses an id that does not exist", async () => {
    await seedItem();
    await expect(block({ ...opts(), id: "MO-999" })).rejects.toThrow(/No roadmap item/);
  });

  it("repairs an already-blocked item whose missing needs made it invalid", async () => {
    await seedItem(ITEM.replace("status: in-progress", "status: blocked"));

    const result = await block(opts());
    expect(result.alreadyBlocked).toBe(true);
    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toEqual([]);
    expect(items[0]!.data.status).toBe("blocked");
    expect(items[0]!.data.needs).toContain("which model");
  });

  it("links a blocked inbox item to its slugged roadmap file", async () => {
    await seedItem(ITEM, "MO-051", "MO-051-agent-code-review.md");
    await block(opts());

    const inbox = await readFile(join(root, "hq/team/cpheinrich.md"), "utf8");
    expect(inbox).toContain(
      "[MO-051](../product/roadmap/MO-051-agent-code-review.md)",
    );
  });

  it("survives a needs containing a colon", async () => {
    await seedItem();
    await block({ ...opts(), needs: "decide: Claude or Codex" });

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toEqual([]);
    expect(items[0]!.data.needs).toBe("decide: Claude or Codex");
  });
});

describe("pm block CLI safeguards", () => {
  it("refuses the trunk branch before writing anything", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    await seedItem();
    const before = await readFile(join(product, "roadmap/MO-051.md"), "utf8");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await blockCli(product, root, "MO-051", {
      owner: "cpheinrich",
      needs: "which model",
    });

    expect(result.code).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("protected trunk branch \"main\""));
    expect(await readFile(join(product, "roadmap/MO-051.md"), "utf8")).toBe(before);
    error.mockRestore();
  });

  it("lists the inboxes that make owner selection ambiguous", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-q", "-b", "work"], { cwd: root });
    await seedItem();
    await mkdir(join(root, "hq/team"), { recursive: true });
    await writeFile(join(root, "hq/team/alexoedelman.md"), "# Inbox\n");
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# Inbox\n");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await blockCli(product, root, "MO-051", { needs: "which model" });

    expect(result.code).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Found 2 inboxes: alexoedelman, cpheinrich"),
    );
    error.mockRestore();
  });
});

describe("unblock", () => {
  it("returns the item to in-progress and clears needs", async () => {
    await seedItem();
    await block({
      productDir: product,
      root,
      id: "MO-051",
      needs: "which model",
      owner: "cpheinrich",
    });
    await unblock(product, "MO-051");

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toEqual([]);
    expect(items[0]!.data.status).toBe("in-progress");
    // Left in place it would read as a live blocker on active work.
    expect(items[0]!.data.needs).toBeUndefined();
  });

  it("refuses an item that is not blocked", async () => {
    await seedItem();
    await expect(unblock(product, "MO-051")).rejects.toThrow(/not blocked/);
  });
});
