import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "../src/cli/tokens.js";
import { renderSwift } from "../src/design/swift.js";
import { parseTokens, renderCss, renderTs } from "../src/design/tokens.js";

const render = (doc: unknown) => renderSwift(parseTokens(doc).tokens, "hq/brand/tokens.json");
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Swift palette", () => {
  it("pairs light/dark primitives and inherits light when no override exists", () => {
    const result = render({ color: { ink: "#123456", paper: "#fff" }, theme: { dark: { color: { ink: "rgba(255, 0, 128, .5)" } } } });
    expect(result.issues).toEqual([]);
    expect(result.content).toContain("_adaptive(light: Color(.sRGB, red: 0.070588, green: 0.203922, blue: 0.337255, opacity: 1.000000), dark: Color(.sRGB, red: 1.000000, green: 0.000000, blue: 0.501961, opacity: 0.500000))");
    expect(result.content).toContain("_adaptive(light: Color(.sRGB, red: 1.000000, green: 1.000000, blue: 1.000000, opacity: 1.000000), dark: Color(.sRGB, red: 1.000000, green: 1.000000, blue: 1.000000, opacity: 1.000000))");
    expect(result.content).toContain("appearance.bestMatch(from: [.darkAqua, .aqua])");
    expect(result.content).toContain("traits.userInterfaceStyle == .dark");
  });

  it.each([
    ["#08f8", "0.000000, green: 0.533333, blue: 1.000000, opacity: 0.533333"],
    ["#00000000", "0.000000, green: 0.000000, blue: 0.000000, opacity: 0.000000"],
    ["#abcdefFF", "0.670588, green: 0.803922, blue: 0.937255, opacity: 1.000000"],
    ["rgb(0, 127.5, 255)", "0.000000, green: 0.500000, blue: 1.000000, opacity: 1.000000"],
    ["rgba(0,0,0,0)", "0.000000, green: 0.000000, blue: 0.000000, opacity: 0.000000"],
  ])("converts %s with exact channel values", (input, expected) => {
    const result = render({ color: { sample: { $value: input, $type: "color" } } });
    expect(result.issues).toEqual([]);
    expect(result.content).toContain(`red: ${expected}`);
  });

  it.each(["#ggg", "#12", "#12345", "red", "var(--ink)", "rgb(256, 0, 0)", "rgb(-1, 0, 0)", "rgba(0, 0, 0, 1.01)", "rgba(0, 0, 0, -0.1)", "rgb(0,0)", "rgb(0,0,0,1)", "rgba(0,0,0)", "rgb(,0,0)", "rgba(0,0,0,Infinity)", "rgb(1e2,0,0)", "rgb(10%,0,0)"]) ("rejects unsupported %s without output", (value) => {
    const result = render({ color: { sample: value } });
    expect(result.content).toBe("");
    expect(result.issues).toEqual([`color.sample: unsupported Swift color ${JSON.stringify(value)}; use hex or numeric rgb()/rgba()`]);
  });

  it("sorts deterministic Swift names and ignores non-color groups", () => {
    const colors = { inkMuted: "#000", "paper-bright": "#fff", blue: { "500": "#123" }, "500": "#456", default: "#789" };
    const result = render({ color: colors, space: { md: "16px" }, home: { background: "linear-gradient(red, blue)" } });
    expect(result.issues).toEqual([]);
    expect(result.content.match(/public static var `([^`]+)`/g)).toEqual([
      "public static var `blue500`", "public static var `color500`", "public static var `default`", "public static var `inkMuted`", "public static var `paperBright`",
    ]);
    expect(result.content).toBe(render({ color: Object.fromEntries(Object.entries(colors).reverse()) }).content);
  });

  it("reports collisions, invalid names, invalid colors and orphan dark tokens together", () => {
    const result = render({ color: { "blue-1": "#000", blue1: "#fff", "!!!": "bad" }, theme: { dark: { color: { extra: "bad" } } } });
    expect(result.content).toBe("");
    expect(result.issues).toEqual([
      "color.blue1: duplicate Swift color name blue1",
      "color.!!!: no valid Swift color name",
      'color.!!!: unsupported Swift color "bad"; use hex or numeric rgb()/rgba()',
      'theme.dark.color.extra: unsupported Swift color "bad"; use hex or numeric rgb()/rgba()',
      "theme.dark.color: extra has no matching light color",
    ]);
    expect(render({ space: { md: 16 } })).toEqual({ content: "", issues: ["Swift output needs at least one color.* token"] });
  });
});

async function fixture(doc: unknown): Promise<string> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const root = await mkdtemp(join(tmpdir(), "swift-tokens-"));
  roots.push(root);
  await mkdir(join(root, "hq/brand"), { recursive: true });
  await writeFile(join(root, "hq/brand/tokens.json"), JSON.stringify(doc));
  return root;
}

describe("Swift token build", () => {
  it("writes only requested outputs and leaves CSS/TS bytes unchanged", async () => {
    const doc = { color: { ink: "#123" }, theme: { dark: { color: { ink: "#fff" } } } };
    const root = await fixture(doc);
    const opts = { root, css: "out/tokens.css", ts: "out/tokens.ts" };
    expect(await build(opts)).toBe(0);
    expect((await readdir(join(root, "out"))).sort()).toEqual(["tokens.css", "tokens.ts"]);
    expect(await build({ ...opts, swift: "out/BrandPalette.swift" })).toBe(0);
    const tokens = parseTokens(doc).tokens;
    const renderOpts = { prefix: "brand", source: "hq/brand/tokens.json" };
    expect(await readFile(join(root, opts.css), "utf8")).toBe(renderCss(tokens, renderOpts));
    expect(await readFile(join(root, opts.ts), "utf8")).toBe(renderTs(tokens, renderOpts));
    expect(await readFile(join(root, "out/BrandPalette.swift"), "utf8")).toBe(render(doc).content);
  });

  it("checks missing and stale Swift without writing; unchanged generation preserves mtime", async () => {
    const root = await fixture({ color: { ink: "#123" } });
    const opts = { root, css: "", swift: "out/BrandPalette.swift" };
    expect(await build({ ...opts, check: true })).toBe(1);
    await expect(stat(join(root, "out"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await build(opts)).toBe(0);
    const path = join(root, opts.swift);
    const before = await stat(path);
    expect(await build({ ...opts, check: true })).toBe(0);
    expect(await build(opts)).toBe(0);
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
    await writeFile(path, "stale");
    expect(await build({ ...opts, check: true })).toBe(1);
    expect(await readFile(path, "utf8")).toBe("stale");
  });

  it("validates Swift before writing any CSS/TS output and keeps web-only colors supported", async () => {
    const root = await fixture({ color: { ink: "var(--ink)" } });
    const opts = { root, css: "out/tokens.css", ts: "out/tokens.ts" };
    expect(await build({ ...opts, swift: "out/BrandPalette.swift" })).toBe(1);
    await expect(stat(join(root, "out"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await build(opts)).toBe(0);
    const before = await readFile(join(root, opts.css), "utf8");
    expect(await build({ ...opts, swift: "out/BrandPalette.swift" })).toBe(1);
    expect(await readFile(join(root, opts.css), "utf8")).toBe(before);
  });
});
