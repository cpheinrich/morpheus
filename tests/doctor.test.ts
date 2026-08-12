import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { doctor, EXPECTED, formatFindings } from "../src/doctor/index.js";
import { analyticsSchema } from "../src/init/templates.js";

let root: string;

const ITEM = (id: string) => `---
id: ${id}
title: An item that exists
status: backlog
priority: P2
owner: agent
prs: []
created: 2026-07-01
updated: 2026-07-01
---

Body.
`;

async function scaffold(kind: string, opts: { prefix?: string | null } = {}) {
  const prefix = opts.prefix === undefined ? "TS" : opts.prefix;
  await writeFile(
    join(root, "morpheus.json"),
    JSON.stringify({ name: "test", kind, ...(prefix ? { prefix } : {}) }, null, 2),
  );
  await writeFile(join(root, "AGENTS.md"), "# agents\n");
  await mkdir(join(root, ".agent"), { recursive: true });
  await writeFile(join(root, ".agent/decisions.md"), "# decisions\n");
  await writeFile(join(root, ".agent/learned.md"), "# learned\n");
  for (const d of EXPECTED[kind as keyof typeof EXPECTED]) {
    await mkdir(join(root, d), { recursive: true });
  }
}

const has = (f: { check: string }[], check: string) => f.some((x) => x.check === check);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morpheus-doctor-"));
});

describe("doctor", () => {
  it("errors when there is no manifest, and stops there", async () => {
    const f = await doctor({ root });
    expect(f).toHaveLength(1);
    expect(f[0]!.check).toBe("manifest");
    expect(f[0]!.severity).toBe("error");
  });

  it("reports no drift on a complete internal project", async () => {
    await scaffold("internal");
    expect(await doctor({ root })).toEqual(
      expect.arrayContaining([]) && expect.not.arrayContaining([expect.objectContaining({ check: "structure" })]),
    );
  });

  it("errors on a missing expected directory", async () => {
    await scaffold("company");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "hq/team"), { recursive: true });
    const f = await doctor({ root });
    expect(f.some((x) => x.check === "structure" && x.message.includes("hq/team"))).toBe(true);
  });

  it("expects more of a company than an internal project", async () => {
    expect(EXPECTED.company.length).toBeGreaterThan(EXPECTED.internal.length);
    expect(EXPECTED.company).toContain("hq/finance");
    expect(EXPECTED.internal).not.toContain("hq/finance");
  });

  it("errors when the prefix is missing", async () => {
    await scaffold("internal", { prefix: null });
    const f = await doctor({ root });
    expect(f.some((x) => x.check === "prefix" && x.severity === "error")).toBe(true);
  });

  it("errors when an item does not use the project prefix", async () => {
    await scaffold("internal");
    await writeFile(join(root, "hq/product/roadmap/XX-001.md"), ITEM("XX-001"));
    const f = await doctor({ root });
    expect(f.some((x) => x.message.includes("does not use this project's prefix"))).toBe(true);
  });

  it("accepts an item that does use the prefix", async () => {
    await scaffold("internal");
    await writeFile(join(root, "hq/product/roadmap/TS-001.md"), ITEM("TS-001"));
    const f = await doctor({ root });
    expect(f.some((x) => x.message.includes("does not use this project's prefix"))).toBe(false);
  });

  it("surfaces invalid roadmap frontmatter", async () => {
    await scaffold("internal");
    await writeFile(join(root, "hq/product/roadmap/TS-002.md"), "---\nid: TS-002\nstatus: nope\n---\n");
    const f = await doctor({ root });
    expect(has(f, "pm:roadmap")).toBe(true);
  });

  it("warns when kind is absent rather than failing", async () => {
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "t", prefix: "TS" }));
    const f = await doctor({ root });
    expect(f.some((x) => x.check === "kind" && x.severity === "warning")).toBe(true);
  });

  it("warns rather than errors on missing top-level files", async () => {
    await scaffold("internal");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "AGENTS.md"));
    const f = await doctor({ root });
    const agents = f.find((x) => x.message.includes("AGENTS.md"));
    expect(agents?.severity).toBe("warning");
  });

  it("warns when a user-facing analytics contract is still the empty scaffold", async () => {
    await scaffold("company");
    await mkdir(join(root, "packages/shared/schema"), { recursive: true });
    await writeFile(join(root, "packages/shared/schema/analytics.ts"), analyticsSchema());

    const f = await doctor({ root });

    expect(f).toContainEqual(
      expect.objectContaining({ check: "analytics", severity: "warning" }),
    );
  });

  it("warns when a user-facing project has no analytics contract", async () => {
    await scaffold("company");

    const f = await doctor({ root });

    expect(f).toContainEqual(
      expect.objectContaining({
        check: "analytics",
        severity: "warning",
        message: expect.stringContaining("Missing analytics contract"),
      }),
    );
  });

  it("recognizes a differently named analytics contract", async () => {
    await scaffold("company");
    await mkdir(join(root, "packages/shared/schema"), { recursive: true });
    await writeFile(
      join(root, "packages/shared/schema/analytics.schema.ts"),
      "type DefineAnalyticsEvents<T> = T;\nexport type ProjectAnalyticsEvents = DefineAnalyticsEvents<{ page_viewed: { event_version: 1 } }>;\n",
    );

    const f = await doctor({ root });

    expect(has(f, "analytics")).toBe(false);
  });

  it("does not mistake an analytics test file for the canonical contract", async () => {
    await scaffold("company");
    await mkdir(join(root, "packages/shared/schema"), { recursive: true });
    await writeFile(
      join(root, "packages/shared/schema/analytics.test.ts"),
      "export type ProjectAnalyticsEvents = { fixture: true };\n",
    );

    const f = await doctor({ root });

    expect(f).toContainEqual(
      expect.objectContaining({
        check: "analytics",
        message: expect.stringContaining("Missing analytics contract"),
      }),
    );
  });

  it("reports an unreadable schema candidate as unknown rather than missing", async () => {
    await scaffold("company");
    await mkdir(join(root, "packages/shared/schema"), { recursive: true });
    await symlink("missing.ts", join(root, "packages/shared/schema/analytics.schema.ts"));

    const f = await doctor({ root });

    expect(f).toContainEqual(
      expect.objectContaining({
        check: "analytics",
        message: expect.stringContaining("Contract state is unknown"),
      }),
    );
    expect(f.some((finding) => finding.message.includes("Missing analytics contract"))).toBe(false);
  });

  it("does not warn after a project populates its analytics contract", async () => {
    await scaffold("company");
    await mkdir(join(root, "packages/shared/schema"), { recursive: true });
    await writeFile(
      join(root, "packages/shared/schema/analytics.ts"),
      "type DefineAnalyticsEvents<T> = T;\nexport type ProjectAnalyticsEvents = DefineAnalyticsEvents<{ page_viewed: { event_version: 1 } }>;\n",
    );

    const f = await doctor({ root });

    expect(has(f, "analytics")).toBe(false);
  });
});

describe("formatFindings", () => {
  it("says so when there is no drift", () => {
    expect(formatFindings([])).toContain("No drift");
  });

  it("counts errors and warnings separately", () => {
    const out = formatFindings([
      { severity: "error", check: "a", message: "x" },
      { severity: "warning", check: "b", message: "y" },
    ]);
    expect(out).toContain("1 error(s), 1 warning(s)");
  });
});

describe("inherits", () => {
  it("does not expect a directory the project declares inherited", async () => {
    await scaffold("company");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "hq/finance"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "t", kind: "company", prefix: "TS", inherits: { finance: "parent" } }),
    );
    const f = await doctor({ root });
    expect(f.some((x) => x.message.includes("hq/finance"))).toBe(false);
  });

  it("still expects a directory that is not inherited", async () => {
    await scaffold("company");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "hq/finance"), { recursive: true });
    await rm(join(root, "hq/ops"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "t", kind: "company", prefix: "TS", inherits: { finance: "parent" } }),
    );
    const f = await doctor({ root });
    expect(f.some((x) => x.message.includes("hq/finance"))).toBe(false);
    expect(f.some((x) => x.message.includes("hq/ops"))).toBe(true);
  });

  it("does not expect descendants of an inherited subtree", async () => {
    await scaffold("company");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "hq/marketing"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({
        name: "t",
        kind: "company",
        prefix: "TS",
        inherits: { marketing: "parent" },
      }),
    );

    const f = await doctor({ root });
    expect(f.some((x) => x.message.includes("hq/marketing/seo"))).toBe(false);
  });
});
