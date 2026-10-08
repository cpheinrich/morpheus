import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { agents, contextFreshness, type Seed } from "../src/init/templates.js";
import { GATED } from "../src/session/gate.js";

const ROOT = join(import.meta.dirname, "..");
const SEED: Seed = { name: "Acme Health", prefix: "ACH", kind: "company", owner: "cpheinrich" };

/**
 * AGENTS.md is loaded into every session and every subagent, so its size is a
 * per-session tax. It was ~50KB before the detail moved into runbooks read on
 * demand; these guards keep it from silently regrowing and keep every pointer
 * it relies on resolvable, because a rule relocated behind a broken link is a
 * rule deleted.
 */
describe("Morpheus's own AGENTS.md", () => {
  const read = () => readFile(join(ROOT, "AGENTS.md"), "utf8");

  it("stays under the startup-context budget", async () => {
    expect(Buffer.byteLength(await read())).toBeLessThanOrEqual(20_000);
  });

  it("points only at runbooks that exist, including their anchors", async () => {
    const text = await read();
    const links = [...text.matchAll(/\]\((docs\/runbooks\/[^)#]+)(?:#([^)]+))?\)/g)];
    expect(links.length).toBeGreaterThanOrEqual(10);
    for (const [, path, anchor] of links) {
      await expect(access(join(ROOT, path!)), path).resolves.toBeUndefined();
      if (anchor) {
        const headings = (await readFile(join(ROOT, path!), "utf8"))
          .split("\n")
          .filter((l) => /^#{1,4} /.test(l))
          .map((l) => l.replace(/^#+ /, "").toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-"));
        expect(headings, `${path}#${anchor}`).toContain(anchor);
      }
    }
  });

  it("keeps the anchor consumer projects link to", async () => {
    // Every scaffolded AGENTS.md links to #what-makes-a-test-count.
    expect(await read()).toMatch(/^### What makes a test count$/m);
  });

  it("carries no example inbox item that parses as a real heading", async () => {
    expect(await read()).not.toMatch(/^## [❗✅]/m);
  });

  it("names every gated command", async () => {
    const text = await read();
    for (const command of Object.keys(GATED)) expect(text, command).toContain(`\`${command}\``);
  });

  it("states refresh-once, focused testing and the loop breaker", async () => {
    const text = await read();
    expect(text).toContain("Refresh again only when a gated command refuses");
    expect(text).toContain("Never pipe `refresh` output through");
    expect(text).toContain("at most once per PR");
    expect(text).toContain("Never re-run an unchanged suite");
    expect(text).toContain("If the same command fails the same way twice");
  });
});

describe("the scaffolded AGENTS.md", () => {
  it("lists every gated command in its context-freshness section", () => {
    // Adding a command to GATED without telling agents means the first they
    // hear of it is a refusal.
    const section = contextFreshness();
    for (const command of Object.keys(GATED)) expect(section, command).toContain(`\`${command}\``);
  });

  it("tells agents to refresh once and only again on refusal", () => {
    const section = contextFreshness();
    expect(section).toContain("once at session start");
    expect(section).toContain("Refresh again only when a gated command refuses");
    expect(section).toContain("Never pipe `refresh` output");
  });

  it("generalises focused local testing beyond iOS and keeps the iOS rule", () => {
    const text = agents(SEED);
    expect(text).toContain("## Local testing: focused first");
    expect(text).toContain("CI runs the full suites and must pass before merge");
    expect(text).toContain("at most\nonce per PR");
    expect(text).toContain("never re-run an unchanged suite");
    expect(text).toContain("Do not run the full iOS test suite locally unless Chris explicitly requests it");
    expect(text).not.toContain("## iOS testing");
  });

  it("carries the loop breaker", () => {
    const text = agents(SEED);
    expect(text).toContain("If the same command fails the same way twice");
    expect(text).toContain("Never idle-loop");
  });

  it("points at the review contract instead of restating it", () => {
    const text = agents(SEED);
    expect(text).toContain("/blob/main/docs/runbooks/independent-review.md");
    // The restated contract was the single largest paragraph.
    expect(text).not.toContain("Canonical\nCodex task paths");
    expect(Buffer.byteLength(text)).toBeLessThan(16_000);
  });

  it("links only to Morpheus runbooks that exist", async () => {
    const text = agents(SEED);
    const links = [...text.matchAll(/cpheinrich\/morpheus\/blob\/main\/(docs\/runbooks\/[^)#\s]+)/g)];
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const [, path] of links) await expect(access(join(ROOT, path!)), path).resolves.toBeUndefined();
    expect(dirname(links[0]![1]!)).toBe("docs/runbooks");
  });
});
