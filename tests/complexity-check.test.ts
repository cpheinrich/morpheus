import { appendFile, cp, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { check as cliCheck } from "../src/cli/complexity.js";
import { runCheck, type CheckReport } from "../src/complexity/check.js";
import { packetSummary } from "../src/complexity/format.js";
import { canaryMismatch, installLizard, toolchainFor, toolStatus } from "../src/complexity/install.js";
import { CANARY_EXPECTED, LIZARD_PIN, pinKey } from "../src/complexity/pin.js";
import { git, jsFunction, put, repo } from "./complexity-helpers.js";

/**
 * These run the real pinned Lizard: a mock would prove the plumbing and not
 * the measurement the policy is about. The install is shared across runs
 * (keyed on the pin, proved by the canary each time) and needs network once.
 */
const TOOLS = process.env["MORPHEUS_TEST_TOOLS_DIR"] || join(tmpdir(), "morpheus-complexity-test-tools");
const env = { ...process.env, MORPHEUS_TOOLS_DIR: TOOLS };

beforeAll(async () => {
  const result = await installLizard(LIZARD_PIN, env);
  if (!result.ok) throw new Error(`could not install the pinned Lizard: ${result.reason}`);
}, 300_000);

const manifest = (complexity?: unknown) => JSON.stringify({ name: "t", prefix: "T", ...(complexity ? { complexity } : {}) });
const enforce = manifest({ mode: "enforce" });
// Spelled in pieces so this file does not trip the check it tests.
const MARKER = "GENERATED" + " CODE";
const FORGIVE = "lizard" + " forgive";

async function check(root: string, opts: { all?: boolean } = {}): Promise<Extract<CheckReport, { state: "ran" }>> {
  const report = await runCheck({ root, base: "main", all: opts.all ?? false, env });
  if (report.state !== "ran") throw new Error(`did not run: ${report.reason}`);
  return report;
}

const rules = (r: Extract<CheckReport, { state: "ran" }>, severity?: string) =>
  r.findings.filter((f) => !severity || f.severity === severity).map((f) => f.rule);

describe("complexity check against the real pinned Lizard", () => {
  it("passes CCN 15 and fails CCN 16 in enforce, at the boundary", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "at.js": jsFunction("atLimit", 15) });
    expect((await check(root)).exitCode).toBe(0);
    await put(root, { "over.js": jsFunction("overLimit", 16) });
    const report = await check(root);
    expect(report.exitCode).toBe(1);
    expect(report.findings.find((f) => f.rule === "ccn-over")).toMatchObject({ severity: "error", path: "over.js", line: 1 });
    expect(report.findings.find((f) => f.rule === "ccn-over")?.message).toContain("CCN 16 (limit 15)");
  });

  it("reports the same over-limit function as a warning in advisory, exit 0", async () => {
    const root = await repo({ "morpheus.json": manifest({ mode: "advisory" }) });
    await put(root, { "over.js": jsFunction("overLimit", 16) });
    const report = await check(root);
    expect(report.exitCode).toBe(0);
    expect(rules(report, "warning")).toContain("ccn-over");
  });

  it("warns on cognitive 16 and never fails on it, even in enforce", async () => {
    const nested = "function deep(a) {\n  if (a) { if (a > 1) { if (a > 2) { if (a > 3) { if (a > 4) { return 5; } } } } }\n  if (a < 0) return -1;\n  return 0;\n}\n";
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "deep.js": nested });
    const report = await check(root);
    expect(report.findings.find((f) => f.rule === "cognitive-over")?.message).toContain("cognitive complexity 16");
    expect(report.exitCode).toBe(0);
  });

  it("measures only touched functions, and an untouched over-limit neighbour stays silent", async () => {
    const root = await repo({ "morpheus.json": enforce, "m.js": jsFunction("old", 20) + jsFunction("small", 2) });
    await put(root, { "m.js": jsFunction("old", 20) + jsFunction("small", 3) });
    const report = await check(root);
    expect(report.exitCode).toBe(0);
    expect(report.evaluation.targeted).toBeGreaterThanOrEqual(1);
    expect(report.evaluation.inTouchedFiles).toBe(3); // old, small and *global*
    expect((await check(root, { all: true })).exitCode).toBe(1);
  });

  it("reports every function of a touched file in --json, flagged or not, with NLOC and cognitive", async () => {
    const root = await repo({ "morpheus.json": enforce, "fam.js": jsFunction("helper", 15) + jsFunction("entry", 15) });
    await put(root, { "fam.js": jsFunction("helper", 15) + jsFunction("entry", 16) });
    // What `--json` prints is this object serialised.
    const report = JSON.parse(JSON.stringify(await check(root))) as Extract<CheckReport, { state: "ran" }>;
    const rows = report.files.find((f) => f.path === "fam.js")?.functions?.filter((f) => f.name !== "*global*");
    expect(rows?.map(({ name, ccn, cognitive, nloc, start, end, targeted }) => ({ name, ccn, cognitive, nloc, start, end, targeted }))).toEqual([
      { name: "helper", ccn: 15, cognitive: 14, nloc: 17, start: 1, end: 17, targeted: false },
      { name: "entry", ccn: 16, cognitive: 15, nloc: 18, start: 18, end: 35, targeted: true },
    ]);
    // Only the touched function is judged; the unflagged helper is reported, not found.
    expect(report.findings.filter((f) => f.rule === "ccn-over").map((f) => f.message)).toEqual(["fam.js:18 entry ( a ) has CCN 16 (limit 15)"]);
    const all = await check(root, { all: true });
    expect(all.files.find((f) => f.path === "fam.js")?.functions?.every((f) => f.targeted)).toBe(true);
  });

  it("notes Markdown, Metal and image changes as coverage, never failing enforce", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "docs/a.md": "# x\n", "Shader.metal": "kernel void k() {}\n", "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]) });
    const report = await check(root);
    expect(report.exitCode).toBe(0);
    expect(report.findings.find((f) => f.rule === "coverage")?.message).toBe(
      "3 file(s) in a language Lizard does not read were not measured: .metal×1, .md×1, .png×1",
    );
  });

  it("fails enforce, and only warns in advisory, on a supported file that is not UTF-8", async () => {
    const bad = Buffer.concat([Buffer.from("function f() { return '"), Buffer.from([0xff, 0xfe]), Buffer.from("'; }\n")]);
    const enforced = await repo({ "morpheus.json": enforce });
    await put(enforced, { "bad.js": bad });
    const report = await check(enforced);
    expect(report.exitCode).toBe(1);
    expect(report.findings.find((f) => f.rule === "unmeasured")?.message).toContain("decode-error");
    const advised = await repo({ "morpheus.json": manifest({ mode: "advisory" }) });
    await put(advised, { "bad.js": bad });
    expect((await check(advised)).exitCode).toBe(0);
  });

  it("measures past a generated-code marker string and fails the over-limit function after it", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "g.js": `const banner = "${MARKER}";\n${jsFunction("after", 16)}` });
    const report = await check(root);
    expect(report.findings.find((f) => f.rule === "directive")).toMatchObject({ severity: "warning", line: 1 });
    expect(report.findings.find((f) => f.rule === "ccn-over")?.message).toContain("after ( a ) has CCN 16");
    expect(report.exitCode).toBe(1);
  });

  it("measures past a generated-code marker in a comment, which stock Lizard stops at", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "c.js": `// ${MARKER}\n${jsFunction("hidden", 16)}` });
    const report = await check(root);
    expect(report.findings.find((f) => f.rule === "ccn-over")?.message).toContain("hidden ( a ) has CCN 16");
    expect(report.exitCode).toBe(1);
  });

  it("measures a function after a forgive comment and fails it", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "f.js": `// #${FORGIVE}\n${jsFunction("forgiven", 16)}` });
    const report = await check(root);
    expect(report.findings.find((f) => f.rule === "directive")).toMatchObject({ severity: "warning", line: 1 });
    expect(report.findings.find((f) => f.rule === "ccn-over")?.message).toContain("forgiven ( a ) has CCN 16");
  });

  it("keeps CRLF line numbers aligned with the diff", async () => {
    const crlf = (jsFunction("first", 2) + jsFunction("second", 17)).replace(/\n/g, "\r\n");
    const root = await repo({ "morpheus.json": enforce, "w.js": crlf });
    await put(root, { "w.js": crlf.replace("if (a === 0) return 0;\r\n  return -1;", "if (a === 0) return 9;\r\n  return -1;") });
    const report = await check(root);
    // Only `first` (line 2) changed; `second` (CCN 17) starts on line 5 and is untouched.
    expect(rules(report)).not.toContain("ccn-over");
  });

  it("does not treat an untouched file's exception as stale in a targeted run, and judges it under --all", async () => {
    const exception = { path: "legacy.js", longName: "legacy ( a )", ccn: 18, kind: "semantic", reason: "A protocol table kept flat on purpose.", ref: "MO-26-11-05-21.48.00" };
    const root = await repo({ "morpheus.json": manifest({ mode: "enforce", exceptions: [exception] }), "legacy.js": jsFunction("legacy", 18) });
    await put(root, { "other.js": jsFunction("other", 2) });
    const targeted = await check(root);
    expect(targeted.findings.find((f) => f.path === "legacy.js")?.message).toContain("not evaluated");
    expect(targeted.exitCode).toBe(0);
    const all = await check(root, { all: true });
    expect(all.findings.filter((f) => f.path === "legacy.js" && f.severity !== "warning").map((f) => f.rule)).toEqual(["exception"]);
    expect(all.exitCode).toBe(0);
  });

  it("calls an exception for a deleted or renamed file stale under --all, and leaves it unevaluated when targeted", async () => {
    const exception = { path: "legacy.js", longName: "legacy ( a )", ccn: 18, kind: "semantic", reason: "A protocol table kept flat on purpose.", ref: "MO-26-11-05-21.48.00" };
    const excluded = { ...exception, path: "vendor/old.js" };
    const root = await repo({
      "morpheus.json": manifest({ mode: "enforce", exclude: ["vendor/**"], exceptions: [exception, excluded] }),
      "legacy.js": jsFunction("legacy", 18),
    });
    git(root, "mv", "legacy.js", "renamed.js");
    const targeted = await check(root);
    expect(targeted.findings.find((f) => f.path === "legacy.js")).toMatchObject({ rule: "exception", severity: "note" });
    // A pure rename changes no line, so the targeted run measures nothing at the new path.
    expect(targeted.findings.find((f) => f.rule === "ccn-over")).toBeUndefined();
    const all = await check(root, { all: true });
    // Exceptions match by exact path, so the function at its new path is not covered.
    expect(all.findings.find((f) => f.rule === "ccn-over")?.path).toBe("renamed.js");
    expect(all.findings.find((f) => f.path === "legacy.js")).toMatchObject({ rule: "stale-exception", severity: "error" });
    expect(all.findings.find((f) => f.path === "legacy.js")?.message).toContain("no longer exists (deleted or renamed)");
    // An excluded path is out of scope, so its exception is only noted.
    expect(all.findings.find((f) => f.path === "vendor/old.js")).toMatchObject({ rule: "exception", severity: "note" });
    expect(all.exitCode).toBe(1);
  });

  it("fails an exception that the function has grown past", async () => {
    const exception = { path: "legacy.js", longName: "legacy ( a )", ccn: 18, kind: "semantic", reason: "A protocol table kept flat on purpose.", ref: "MO-26-11-05-21.48.00" };
    const root = await repo({ "morpheus.json": manifest({ mode: "enforce", exceptions: [exception] }), "legacy.js": jsFunction("legacy", 18) });
    await put(root, { "legacy.js": jsFunction("legacy", 19) });
    const report = await check(root);
    expect(report.findings.find((f) => f.rule === "stale-exception")?.message).toContain("measured CCN 19 exceeds the recorded 18");
    expect(report.exitCode).toBe(1);
  });

  it("shows a policy change between the merge base and the tree", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { "morpheus.json": manifest({ mode: "enforce", exclude: ["over.js"] }), "over.js": jsFunction("o", 30) });
    const report = await check(root);
    expect(report.exitCode).toBe(0);
    expect(report.delta[0]).toBe("complexity policy changed in this range");
    expect(report.delta[1]).toContain('"mode":"enforce"}');
    expect(report.delta[2]).toContain('"exclude":["over.js"]');
    expect(packetSummary(report)).toContain('"exclude":["over.js"]');
  });

  it("is not-run, exit 2, when nothing is installed — in advisory as well", async () => {
    const root = await repo({ "morpheus.json": manifest({ mode: "advisory" }) });
    const empty = await mkdtemp(join(tmpdir(), "no-tools-"));
    const report = await runCheck({ root, base: "main", all: false, env: { ...process.env, MORPHEUS_TOOLS_DIR: empty } });
    expect(report).toMatchObject({ state: "not-run", exitCode: 2 });
    expect(packetSummary(report)).toMatch(/^Complexity: NOT RUN — not installed/);
  });

  it("never follows a symlink, inside or outside the repository", async () => {
    const outside = await mkdtemp(join(tmpdir(), "outside-"));
    await writeFile(join(outside, "secret.js"), jsFunction("secret", 30));
    const root = await repo({ "morpheus.json": enforce, "real.js": jsFunction("real", 2) });
    await symlink(join(outside, "secret.js"), join(root, "out.js"));
    await symlink("real.js", join(root, "in.js"));
    const report = await check(root);
    expect(report.exitCode).toBe(0);
    expect(report.findings.filter((f) => f.rule === "coverage").map((f) => f.message).sort()).toEqual([
      "in.js was not read: symlink, not followed",
      "out.js was not read: symlink, not followed",
    ]);
    expect(rules(report)).not.toContain("ccn-over");
  });

  it("leaves untracked files, such as CI's own .morpheus checkout, out when told to", async () => {
    const root = await repo({ "morpheus.json": enforce });
    await put(root, { ".morpheus/src/big.js": jsFunction("big", 30), "mine.js": jsFunction("mine", 2) });
    for (const all of [false, true]) {
      const local = await runCheck({ root, base: "main", all, env });
      expect(local.state === "ran" && local.exitCode, `local all=${all}`).toBe(1);
      const ci = await runCheck({ root, base: "main", all, untracked: false, env });
      if (ci.state !== "ran") throw new Error(ci.reason);
      expect(ci.exitCode, `ci all=${all}`).toBe(0);
      expect(ci.findings.some((f) => f.path?.startsWith(".morpheus/"))).toBe(false);
    }
    // The CLI's --ci path is the one that turns untracked files off.
    const saved = { tools: process.env["MORPHEUS_TOOLS_DIR"], summary: process.env["GITHUB_STEP_SUMMARY"] };
    process.env["MORPHEUS_TOOLS_DIR"] = TOOLS;
    delete process.env["GITHUB_STEP_SUMMARY"];
    try {
      expect(await cliCheck(root, { base: "main", all: false, json: true, ci: true })).toBe(0);
      expect(await cliCheck(root, { base: "main", all: false, json: true, ci: false })).toBe(1);
    } finally {
      if (saved.tools === undefined) delete process.env["MORPHEUS_TOOLS_DIR"];
      else process.env["MORPHEUS_TOOLS_DIR"] = saved.tools;
      if (saved.summary !== undefined) process.env["GITHUB_STEP_SUMMARY"] = saved.summary;
    }
  });

  it("refuses an invalid policy instead of falling back to defaults", async () => {
    const root = await repo({ "morpheus.json": manifest({ mode: "strict" }) });
    const report = await runCheck({ root, base: "main", all: false, env });
    expect(report).toMatchObject({ state: "not-run", exitCode: 2 });
  });
});

describe("installation", () => {
  it("names the directory by the whole pin, so a dependency bump never reuses a venv", () => {
    const bumped = { ...LIZARD_PIN, requirements: [...LIZARD_PIN.requirements.slice(0, 1), "pathspec==1.1.2 --hash=sha256:00"] };
    expect(pinKey(bumped)).not.toBe(pinKey(LIZARD_PIN));
    expect(toolchainFor(bumped, env).dir).not.toBe(toolchainFor(LIZARD_PIN, env).dir);
  });

  it("reads a hand-written stamp over a broken venv as broken, not ready", async () => {
    const fake = await mkdtemp(join(tmpdir(), "fake-tools-"));
    const { dir } = toolchainFor(LIZARD_PIN, { MORPHEUS_TOOLS_DIR: fake });
    await put(dir, { "ready.json": "{}", "venv/bin/python": "#!/bin/sh\nexit 1\n" });
    const status = await toolStatus(LIZARD_PIN, { MORPHEUS_TOOLS_DIR: fake });
    expect(status.state).toBe("broken");
    const root = await repo({ "morpheus.json": enforce });
    expect(await runCheck({ root, base: "main", all: false, env: { ...process.env, MORPHEUS_TOOLS_DIR: fake } })).toMatchObject({ state: "not-run", exitCode: 2 });
  });

  it("fails an unreachable commit and leaves no stamp behind", async () => {
    const source = await repo({ "lizard.py": "" });
    const fake = await mkdtemp(join(tmpdir(), "unreachable-tools-"));
    const pin = { ...LIZARD_PIN, repository: source, commit: "0123456789abcdef0123456789abcdef01234567" };
    const result = await installLizard(pin, { ...process.env, MORPHEUS_TOOLS_DIR: fake });
    expect(result.ok).toBe(false);
    expect(await readdir(join(fake, "lizard")).catch(() => [])).toEqual([]);
  });

  it("holds the pin to a Python floor no lower than its wheels declare", async () => {
    const site = join(toolchainFor(LIZARD_PIN, env).dir, "venv", "lib");
    const [pythonDir] = await readdir(site);
    const packages = join(site, pythonDir!, "site-packages");
    const metadata = (await readdir(packages)).filter((d) => d.endsWith(".dist-info") && /^(pygments|pathspec)-/i.test(d));
    expect(metadata).toHaveLength(2);
    for (const info of metadata) {
      const text = await readFile(join(packages, info, "METADATA"), "utf8");
      const [, major, minor] = /^Requires-Python: >=(\d+)\.(\d+)/m.exec(text) ?? [];
      expect(major, `${info} Requires-Python`).toBeDefined();
      const [floorMajor, floorMinor] = LIZARD_PIN.pythonFloor;
      expect(Number(major) * 100 + Number(minor), info).toBeLessThanOrEqual(floorMajor * 100 + floorMinor);
    }
  });

  it("reads a copy whose Lizard source was modified as broken, though its canary would still pass", async () => {
    const copy = await mkdtemp(join(tmpdir(), "edited-tools-"));
    const original = toolchainFor(LIZARD_PIN, env).dir;
    const edited = toolchainFor(LIZARD_PIN, { MORPHEUS_TOOLS_DIR: copy }).dir;
    await cp(original, edited, { recursive: true, verbatimSymlinks: true });
    expect((await toolStatus(LIZARD_PIN, { MORPHEUS_TOOLS_DIR: copy })).state).toBe("ok");
    await appendFile(join(edited, "src", "lizard.py"), "\n# edited\n");
    expect(await toolStatus(LIZARD_PIN, { MORPHEUS_TOOLS_DIR: copy })).toMatchObject({ state: "broken", reason: "Lizard source has local modifications" });
  });

  it("checks the pinned fork's fixes, not just a JavaScript sample", () => {
    // Upstream 4f6979da measures no `label` function, the Swift top level at CCN 4 and Notice at 4.
    expect(CANARY_EXPECTED.map((r) => `${r.path} ${r.name} ${r.ccn}${r.lines ? ` ${r.lines.join("-")}` : ""}`)).toEqual([
      "canary.js canary 6", "canary.swift label 3", "canary.swift check 4", "canary.swift *global* 1",
      "canary.tsx pick 2", "canary.tsx Notice 2",
      "canary.ts choose 4", "canary.ts run 3", "canary.ts *global* 1",
      "attributes.tsx Row 1 1-3", "attributes.tsx Grid 3 4-11", "attributes.tsx Card 2 12-14", "attributes.tsx after 2 15-15",
      "attributes.jsx Row 1 1-3", "attributes.jsx Grid 3 4-11", "attributes.jsx Card 2 12-14", "attributes.jsx after 2 15-15",
      "valueless.tsx Chart 2 1-9", "valueless.tsx after 2 10-10", "valueless.jsx Chart 2 1-9", "valueless.jsx after 2 10-10",
    ]);
  });

  it("refuses a canary row whose bounds moved, even when its CCN and cognitive match", () => {
    const want = CANARY_EXPECTED.find((r) => r.path === "attributes.tsx" && r.name === "Grid")!;
    const parsed = (end: number) => ({ files: [{ path: "attributes.tsx", functions: [{ name: "Grid", start: 4, end, ccn: 3, cognitive: 2 }] }] });
    expect(canaryMismatch(parsed(11), want)).toBeNull();
    expect(canaryMismatch(parsed(12), want)).toBe(
      "canary attributes.tsx Grid measured CCN 3, cognitive 2, lines 4-12; the pinned build gives CCN 3, cognitive 2, lines 4-11",
    );
  });

  it("refuses the previous pin, whose TypeScript reader folds functions after a template literal type into *global*", async () => {
    // 7f14ea5 (tag morpheus-analyzer-2026-11-06) measures canary.ts as one *global* row, CCN 6.
    const previous = { ...LIZARD_PIN, commit: "7f14ea5c31ea3201c8c83eb2e0a89d1740e79edd" };
    const result = await installLizard(previous, env);
    expect(result).toEqual({
      ok: false,
      reason: "canary canary.ts choose measured no such function; the pinned build gives CCN 4, cognitive 1",
    });
    expect(await toolStatus(previous, env)).toMatchObject({ state: "broken", reason: result.ok ? "" : result.reason });
  }, 300_000);

  it("refuses 3b53c11, whose JSX reader runs a function past a valueless attribute that follows a braced one", async () => {
    // 3b53c11 (tag morpheus-analyzer-2026-11-06-tsx) measures valueless.tsx as Chart 1-10 CCN 3 and no after.
    const previous = { ...LIZARD_PIN, commit: "3b53c116fe93aebea86f44cd5d001813cfc13401" };
    const result = await installLizard(previous, env);
    expect(result).toEqual({
      ok: false,
      reason: "canary valueless.tsx Chart measured CCN 3, cognitive 2, lines 1-10; the pinned build gives CCN 2, cognitive 1, lines 1-9",
    });
    expect(await toolStatus(previous, env)).toMatchObject({ state: "broken", reason: result.ok ? "" : result.reason });
  }, 300_000);

  it("refuses 484bbd0, whose JSX reader runs a function past a spread or hyphenated attribute and drops the next two", async () => {
    // 484bbd0 (tag morpheus-analyzer-2026-11-06-ts) measures attributes.tsx as Row 1-3, Grid 4-15 CCN 4, and no Card or after.
    const previous = { ...LIZARD_PIN, commit: "484bbd057c126bdb3c7a18e83e98d5114aa9a7ee" };
    const result = await installLizard(previous, env);
    expect(result).toEqual({
      ok: false,
      reason: "canary attributes.tsx Grid measured CCN 4, cognitive 3, lines 4-15; the pinned build gives CCN 3, cognitive 2, lines 4-11",
    });
    expect(await toolStatus(previous, env)).toMatchObject({ state: "broken", reason: result.ok ? "" : result.reason });
  }, 300_000);

  it("starts nothing through a shell", async () => {
    const source = await readFile(join(import.meta.dirname, "../src/complexity/install.ts"), "utf8");
    expect(source).not.toMatch(/shell:\s*true|\bexec\(|execSync/);
  });
});

