import { describe, expect, it } from "vitest";
import { applyMode, evaluate, type FileResult, type FunctionRow } from "../src/complexity/evaluate.js";
import { annotations, formatReport } from "../src/complexity/format.js";
import { inScope, policyDelta, readConfig, type ComplexityConfig } from "../src/complexity/policy.js";

const config = (over: Partial<ComplexityConfig> = {}): ComplexityConfig => {
  const read = readConfig(JSON.stringify({ complexity: over }));
  if (!read.ok) throw new Error(read.reason);
  return read.config;
};
const row = (longName: string, ccn: number, start = 1): FunctionRow => ({ name: longName.split(" ")[0]!, longName, start, end: start + 5, ccn, cognitive: 0, nloc: 5 });
const swift = (functions: FunctionRow[]): FileResult => ({ path: "Model.swift", status: "measured", directives: [], functions });
const exception = (longName: string, ccn: number) => ({ path: "Model.swift", longName, ccn, kind: "analyzer-false-positive" as const, reason: "Lizard counts nested CodingKeys cases.", ref: "terryyin/lizard#558" });

describe("readConfig", () => {
  it("treats an absent block as not enrolled, with the defaults", () => {
    const read = readConfig(JSON.stringify({ name: "x" }));
    expect(read).toMatchObject({ ok: true, enrolled: false, config: { mode: "advisory", ccn: 15, cognitiveWarn: 15, exclude: [] } });
  });

  it("refuses an unknown key, an unknown mode, and an exception without a reason or reference", () => {
    expect(readConfig(JSON.stringify({ complexity: { mode: "advisory", ignore: ["**"] } })).ok).toBe(false);
    expect(readConfig(JSON.stringify({ complexity: { mode: "off" } })).ok).toBe(false);
    const bare = { path: "a.js", longName: "f ( )", ccn: 20, kind: "semantic" };
    expect(readConfig(JSON.stringify({ complexity: { exceptions: [bare] } })).ok).toBe(false);
  });
});

describe("scope", () => {
  it("applies include, then exclude, including dotfiles", () => {
    const c = config({ include: ["apps/**", ".github/**"], exclude: ["apps/generated/**"] });
    expect(inScope(c, "apps/web/a.ts")).toBe(true);
    expect(inScope(c, ".github/scripts/x.js")).toBe(true);
    expect(inScope(c, "apps/generated/x.ts")).toBe(false);
    expect(inScope(c, "tools/x.ts")).toBe(false);
  });
});

describe("exceptions", () => {
  const targets = new Map([["Model.swift", "all" as const]]);
  const judge = (c: ComplexityConfig, functions: FunctionRow[]) => evaluate(c, [swift(functions)], targets).findings;

  it("covers one of two Swift initialisers by long name and leaves the other failing", () => {
    const c = config({ exceptions: [exception("init a : Int", 18)] });
    const findings = judge(c, [row("init a : Int", 18), row("init b : String", 17, 10)]);
    expect(findings.filter((f) => f.rule === "ccn-over").map((f) => f.message)).toEqual(["Model.swift:10 init b : String has CCN 17 (limit 15)"]);
    expect(findings.find((f) => f.rule === "exception")?.message).toContain("excepted at CCN 18");
  });

  it("is stale, with its reason, when the long name is ambiguous or gone", () => {
    const c = config({ exceptions: [exception("init a : Int", 18)] });
    expect(judge(c, [row("init a : Int", 18), row("init a : Int", 18, 20)]).find((f) => f.rule === "stale-exception")?.message).toContain("2 functions share that longName");
    expect(judge(c, [row("init b : String", 3)]).find((f) => f.rule === "stale-exception")?.message).toContain("no function with that longName");
  });

  it("asks to tighten an exception looser than the measurement, and to remove one no longer needed", () => {
    const c = config({ exceptions: [exception("init a : Int", 20)] });
    expect(judge(c, [row("init a : Int", 18)]).find((f) => f.rule === "loose-exception")?.message).toContain("tighten it to 18");
    expect(judge(c, [row("init a : Int", 15)]).find((f) => f.rule === "loose-exception")?.message).toContain("within the limit; remove");
    expect(judge(c, [row("init a : Int", 16)]).find((f) => f.rule === "loose-exception")?.severity).toBe("warning");
  });

  it("calls a changed file's exception stale when the file could not be measured", () => {
    const c = config({ exceptions: [exception("init a : Int", 18)] });
    const findings = evaluate(c, [{ path: "Model.swift", status: "unmeasured", error: "decode-error" }], targets).findings;
    expect(findings.map((f) => f.rule)).toEqual(["unmeasured", "stale-exception"]);
  });
});

describe("mode", () => {
  it("turns every error into a warning in advisory and keeps them in enforce", () => {
    const findings = [{ rule: "ccn-over", severity: "error" as const, message: "x" }];
    expect(applyMode(config({ mode: "advisory" }), findings)[0]!.severity).toBe("warning");
    expect(applyMode(config({ mode: "enforce" }), findings)[0]!.severity).toBe("error");
  });
});

describe("policyDelta", () => {
  it("is silent when unchanged and shows before and after otherwise", () => {
    expect(policyDelta({ mode: "enforce" }, { mode: "enforce" })).toEqual([]);
    expect(policyDelta(undefined, { mode: "advisory" })).toEqual([
      "complexity policy changed in this range",
      "  before: (absent)",
      '  after:  {"mode":"advisory"}',
    ]);
  });
});

describe("reporting", () => {
  const ran = (findings: { rule: string; severity: "error" | "warning" | "note"; path?: string; line?: number; message: string }[], delta: string[] = []) => ({
    state: "ran" as const, enrolled: true, config: config({ mode: "enforce", exclude: ["gen/**"] }), scope: "changed" as const,
    mergeBase: "a".repeat(40), delta, evaluation: { findings, targeted: 2, inTouchedFiles: 5, measuredFiles: 1 },
    findings, lizardVersion: "1.25.0", exitCode: findings.some((f) => f.severity === "error") ? (1 as const) : (0 as const),
  });

  it("leads with the verdict, then the policy delta and every exclude", () => {
    const text = formatReport(ran([{ rule: "ccn-over", severity: "error", path: "a.js", line: 3, message: "a.js:3 f has CCN 16 (limit 15)" }], ["complexity policy changed in this range"]));
    expect(text.split("\n")).toEqual([
      "Complexity: 1 blocking finding(s) — enforce, CCN limit 15, cognitive advisory 15, Lizard 1.25.0",
      "Scope: changes since aaaaaaaaaaaa — 2 function(s) checked, 5 in 1 measured file(s)",
      "! complexity policy changed in this range",
      "Excluded by complexity.exclude: gen/**",
      "✗ a.js:3 f has CCN 16 (limit 15)",
    ]);
  });

  it("escapes annotation properties and messages, and annotates no notes", () => {
    const lines = annotations(ran([
      { rule: "ccn-over", severity: "error", path: "dir,x/a:b.js", line: 3, message: "50% over\nlimit" },
      { rule: "coverage", severity: "note", message: "n" },
    ]));
    expect(lines).toEqual(["::error file=dir%2Cx/a%3Ab.js,line=3::50%25 over%0Alimit"]);
  });
});
