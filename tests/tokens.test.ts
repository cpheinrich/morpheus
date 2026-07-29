import { describe, expect, it } from "vitest";
import { parseTokens, renderCss, renderTs } from "../src/design/tokens.js";

const OPTS = { prefix: "brand", source: "hq/brand/tokens.json" };
const names = (doc: unknown): string[] => parseTokens(doc).tokens.map((t) => t.name);

describe("parsing a token document", () => {
  it("flattens nested groups into kebab-cased names", () => {
    expect(names({ color: { ink: "#101010", paperDeep: "#eee" } })).toEqual([
      "color-ink",
      "color-paper-deep",
    ]);
  });

  it("unwraps the DTCG $value form", () => {
    const { tokens, issues } = parseTokens({
      color: { ink: { $value: "#101010", $type: "color" } },
    });

    expect(issues).toEqual([]);
    expect(tokens[0]).toMatchObject({ name: "color-ink", value: "#101010" });
  });

  it("accepts the plain nested form, because every brand file we have uses it", () => {
    const { tokens, issues } = parseTokens({ space: { md: "16px" } });

    expect(issues).toEqual([]);
    expect(tokens[0]?.value).toBe("16px");
  });

  it("keeps numbers, which YAML-free JSON files use for line heights", () => {
    expect(parseTokens({ type: { leading: 1.5 } }).tokens[0]?.value).toBe("1.5");
  });

  it("skips $schema and meta rather than emitting them as tokens", () => {
    expect(names({ $schema: "https://x", meta: { name: "Evo" }, color: { ink: "#000" } })).toEqual([
      "color-ink",
    ]);
  });

  it("rejects arrays instead of silently joining or dropping them", () => {
    const { issues } = parseTokens({ shadow: { raised: ["0 1px 2px", "0 2px 4px"] } });

    // A CSS custom property has no array form; either fallback produces a
    // stylesheet that looks fine and is wrong.
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/arrays are not tokens/);
  });

  it("names both sides of a collision rather than letting one win", () => {
    const { issues } = parseTokens({ color: { inkMuted: "#333", "ink-muted": "#444" } });

    expect(issues[0]).toMatch(/both become --color-ink-muted/);
  });

  it("reports every problem at once", () => {
    const { issues } = parseTokens({
      a: { x: [1] },
      b: { y: [2] },
    });

    expect(issues).toHaveLength(2);
  });

  it("rejects a document that is not an object", () => {
    expect(parseTokens([1, 2]).issues[0]).toMatch(/must be a JSON object/);
    expect(parseTokens("nope").issues[0]).toMatch(/must be a JSON object/);
  });
});

describe("rendering", () => {
  const { tokens } = parseTokens({ color: { ink: "#101010" }, space: { md: "16px" } });

  it("emits prefixed custom properties under :root", () => {
    const css = renderCss(tokens, OPTS);

    expect(css).toContain(":root {");
    expect(css).toContain("  --brand-color-ink: #101010;");
    expect(css).toContain("  --brand-space-md: 16px;");
  });

  it("names its source and forbids hand-editing", () => {
    const css = renderCss(tokens, OPTS);

    expect(css).toContain("hq/brand/tokens.json");
    expect(css).toMatch(/Do not edit by hand/);
  });

  it("honours a custom selector for scoped themes", () => {
    expect(renderCss(tokens, { ...OPTS, selector: "[data-theme='dark']" })).toContain(
      "[data-theme='dark'] {",
    );
  });

  it("emits var() references so a deleted token fails at build", () => {
    const ts = renderTs(tokens, OPTS);

    // A missing custom property renders as nothing; a missing TS key does not
    // compile, which is the whole reason this file exists.
    expect(ts).toContain('"color-ink": "var(--brand-color-ink)"');
    expect(ts).toContain("export type TokenName");
  });

  it("also emits literal values, for contexts without custom properties", () => {
    expect(renderTs(tokens, OPTS)).toContain('"color-ink": "#101010"');
  });
});
