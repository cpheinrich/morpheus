import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { prompt, PROMPT_PATH } from "../src/cli/complexity.js";

const SOURCE = new URL("../src/complexity/refactoring-prompt.md", import.meta.url);

describe("morpheus complexity prompt", () => {
  it("prints the canonical prompt byte for byte, from the file shipped beside the module", async () => {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    try {
      expect(await prompt()).toBe(0);
    } finally {
      spy.mockRestore();
    }
    // Compiled, PROMPT_PATH resolves to dist/complexity/, which `pnpm compile` fills from src.
    expect(PROMPT_PATH.pathname.endsWith("/complexity/refactoring-prompt.md")).toBe(true);
    expect(out.join("")).toBe(await readFile(SOURCE, "utf8"));
  });

  it("ships a compiled copy identical to the source", async () => {
    const dist = await readFile(new URL("../dist/complexity/refactoring-prompt.md", import.meta.url), "utf8");
    expect(dist).toBe(await readFile(SOURCE, "utf8"));
  });

  it("keeps all fifteen rules in order, and the ones review added after real regressions", async () => {
    const text = await readFile(SOURCE, "utf8");
    const numbers = [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    for (const rule of [
      "Extract a helper when it names a coherent responsibility, rather than one helper per branch",
      "Never hide branches in unmeasured properties/closures",
      "Preserve a callback's receiver",
      "Preserve partial results and mutations already established when a later operation throws",
      "compare an observable call/state trace for both its taken and bypassed paths",
      "count an unchanged helper on both sides or neither",
    ]) expect(text).toContain(rule);
  });

  it("names no private path, project id or machine", async () => {
    const text = await readFile(SOURCE, "utf8");
    expect(text).not.toMatch(/\/Users\/|\/private\/|\/var\/folders|~\/|\bEV-\d|\bEvo\b|restaurant|RANSAC|[0-9a-f]{9,40}\b/);
  });
});
