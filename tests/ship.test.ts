import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  didNoWork,
  formatReconcile,
  markShipped,
  type ReconcileResult,
} from "../src/pm/ship.js";

const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

function item(id: string, extra = ""): string {
  return `---
id: ${id}
title: A thing that was built
status: review
priority: P1
created: 2026-07-01
updated: 2026-07-01
${extra}---

Body text that must survive.
`;
}

describe("markShipped", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ship-"));
    await mkdir(join(dir, "roadmap"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const write = (id: string, extra?: string) =>
    writeFile(join(dir, "roadmap", `${id}.md`), item(id, extra));
  const read = (id: string) => readFile(join(dir, "roadmap", `${id}.md`), "utf8");

  it("sets status and records the PR that shipped it", async () => {
    await write("MO-020");
    await markShipped(dir, "MO-020", 10);
    const out = await read("MO-020");

    expect(out).toMatch(/^status: shipped$/m);
    expect(out).toMatch(/^prs: \[10\]$/m);
    expect(out).toContain("Body text that must survive.");
  });

  it("keeps prs sorted when an item shipped across more than one PR", async () => {
    await write("MO-017", "prs: [4]\n");
    await markShipped(dir, "MO-017", 1);

    expect(await read("MO-017")).toMatch(/^prs: \[1, 4\]$/m);
  });

  it("is idempotent — running twice does not duplicate the PR", async () => {
    await write("MO-020");
    await markShipped(dir, "MO-020", 10);
    await markShipped(dir, "MO-020", 10);

    expect(await read("MO-020")).toMatch(/^prs: \[10\]$/m);
  });

  it("ships without a PR number when there is none to record", async () => {
    await write("MO-007");
    await markShipped(dir, "MO-007");
    const out = await read("MO-007");

    expect(out).toMatch(/^status: shipped$/m);
    expect(out).not.toMatch(/^prs:/m);
  });

  it("advances the updated date", async () => {
    await write("MO-020");
    await markShipped(dir, "MO-020", 10);

    expect(await read("MO-020")).not.toMatch(/^updated: 2026-07-01$/m);
  });

  it("names the item rather than throwing something opaque", async () => {
    await expect(markShipped(dir, "MO-999")).rejects.toThrow(/MO-999/);
  });
});

describe("didNoWork", () => {
  const pr = (files: string[] | null) => ({ number: 31, branch: "mo-010-x", files });

  it("is true for the shape that shipped MO-010 — inbox plus board bookkeeping", () => {
    expect(
      didNoWork(
        pr([
          ".agent/inbox-archive/2026-07-29-1330-cpheinrich.md",
          "hq/team/cpheinrich.md",
          "hq/product/roadmap/MO-010.md",
          "hq/product/roadmap/README.md",
        ]),
      ),
    ).toBe(true);
  });

  it("is false as soon as one real file changed", () => {
    expect(didNoWork(pr(["hq/product/roadmap/MO-010.md", "src/pm/ship.ts"]))).toBe(false);
  });

  // The distinction the whole guard rests on. An unread file list is not
  // evidence that a PR did nothing, and treating it as such would refuse to
  // ship legitimate work the day `gh` renames a field.
  it("is false when the file list could not be read, which is not evidence", () => {
    expect(didNoWork(pr(null))).toBe(false);
  });

  it("is false for an empty list, the same vacuous-every trap", () => {
    expect(didNoWork(pr([]))).toBe(false);
  });
});

describe("formatReconcile", () => {
  const result = (outcomes: ReconcileResult["outcomes"], blind = false): string =>
    plain(formatReconcile({ outcomes, blind }));

  it("says nothing is in review rather than printing empty headings", () => {
    expect(result([])).toContain("Nothing in review");
  });

  it("distinguishes gh being unreachable from gh finding nothing", () => {
    const unconfirmed = [{ kind: "unconfirmed" as const, id: "MO-007" }];

    expect(result(unconfirmed, true)).toContain("Could not reach");
    expect(result(unconfirmed, false)).toContain("No branch and no merged PR");
    // Both must refuse to claim it shipped.
    expect(result(unconfirmed, true)).not.toContain("Shipped 1");
    expect(result(unconfirmed, false)).not.toContain("Shipped 1");
  });

  it("reports a no-work item without claiming it shipped", () => {
    const out = result([
      { kind: "no-work", id: "MO-010", pr: 31, branch: "mo-010-simplify-architecture-md" },
    ]);

    expect(out).toContain("MO-010");
    expect(out).toContain("did not do the item's work");
    expect(out).not.toContain("Shipped 1");
    // The way out, since the tool refusing without a remedy is its own dead end.
    expect(out).toContain("morpheus pm ship");
  });

  it("gives the exact command to clear a merged branch that still blocks a claim", () => {
    const out = result([
      { kind: "stale", id: "MO-017", branch: "mo-017-branch-protection", pr: 1 },
    ]);

    expect(out).toContain("read as live claims");
    expect(out).toContain("git push origin --delete mo-017-branch-protection");
  });

  it("says a backlog item with a merged PR was left alone", () => {
    const out = result([{ kind: "reopened", id: "MO-015", pr: 2 }]);

    // Re-shipping a deliberate reopen is a tool arguing with its owner.
    expect(out).toContain("MO-015 (#2)");
    expect(out).toContain("in case the reopen was");
  });

  it("keeps open items quiet — they are not a problem", () => {
    const out = result([{ kind: "open", id: "MO-027", branch: "mo-027-x" }]);

    expect(out).toContain("MO-027");
    expect(out).not.toMatch(/error|missing|blocked/i);
  });
});
