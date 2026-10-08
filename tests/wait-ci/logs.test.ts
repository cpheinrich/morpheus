import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collapseRepeats, isLabelRace, LINE_WIDTH, logText, stripAnsi, trimFailedLog } from "../../src/wait-ci/logs.js";

/**
 * Condensed from real `gh run view --job <id> --log-failed` output on
 * cpheinrich/morpheus: the runner banner, the failing step and post-job
 * cleanup are kept in their original form, including gh's `^[[` rendering of
 * ANSI escapes and the BOM on the first line.
 */
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("log line text", () => {
  it("drops the job and step columns, BOM, timestamp and colour", () => {
    expect(logText("pr / conventions\tUNKNOWN STEP\t﻿2026-10-07T11:11:14.9369672Z Current runner version: '2.337.0'")).toBe(
      "Current runner version: '2.337.0'",
    );
    expect(logText("node / check\tUNKNOWN STEP\t2026-10-07T11:11:14Z ^[[36;1mset -euo pipefail^[[0m")).toBe("set -euo pipefail");
  });

  it("strips real escape bytes as well as gh's caret rendering", () => {
    expect(stripAnsi("\u001b[31m✗ fail\u001b[0m and ^[[90mgrey^[[39m")).toBe("✗ fail and grey");
  });

  it("collapses consecutive repeats with a count, and only consecutive ones", () => {
    expect(collapseRepeats(["a", "a", "a", "b", "a"])).toEqual(["a  (×3)", "b", "a"]);
    expect(collapseRepeats([])).toEqual([]);
  });
});

describe("trimFailedLog on real failures", () => {
  it("label race: the conventions step output, without the echoed script, env or cleanup", () => {
    const trimmed = trimFailedLog(fixture("label-race.log"));
    expect(trimmed.step).toBe("set -euo pipefail");
    expect(trimmed.omitted).toBe(0);
    expect(trimmed.lines).toEqual([
      "✗ [agent-review] agent-reviewed label is not applied, so the PR is not marked merge-ready. Review record validation was not run. Apply the label once independent review covers the current head; leave…",
      "",
      "1 blocking issue(s).",
      "error: Process completed with exit code 1.",
    ]);
    expect(trimmed.lines[0]).toHaveLength(LINE_WIDTH);
    expect(isLabelRace("pr / conventions", trimmed.lines)).toBe(true);
  });

  it("a genuine conventions failure is not a label race", () => {
    const trimmed = trimFailedLog(fixture("review-summary.log"));
    expect(trimmed.lines).toEqual([
      "✗ [agent-review] repeat the review summary as a visible paragraph outside the JSON block",
      "",
      "1 blocking issue(s).",
      "error: Process completed with exit code 1.",
    ]);
    expect(isLabelRace("pr / conventions", trimmed.lines)).toBe(false);
  });

  it("a long diff keeps its head (which file) and tail (the error), with the gap counted", () => {
    const trimmed = trimFailedLog(fixture("build-diff.log"), 60);
    expect(trimmed.step).toBe('if [ -z "$BUILD_OUTPUT_DIRECTORY" ]; then');
    expect(trimmed.lines).toHaveLength(60);
    expect(trimmed.omittedAfter).toBe(15);
    expect(trimmed.lines[0]).toBe("diff --git a/dist/cli/dispatch.js b/dist/cli/dispatch.js");
    expect(trimmed.lines.at(-1)).toBe("error: Process completed with exit code 1.");
    // Earlier steps (pnpm test ran and passed) and cleanup never leak in.
    expect(trimmed.lines.some((l) => l.includes("Post job cleanup") || l.includes("Run pnpm test"))).toBe(false);
    const kept = trimFailedLog(fixture("build-diff.log"), 10_000);
    expect(kept.omitted).toBe(0);
    expect(trimmed.omitted).toBe(kept.lines.length - 60);
  });

  it("at exactly the budget nothing is omitted; one over, the gap appears", () => {
    const body = Array.from({ length: 10 }, (_, i) => `job\tstep\t2026-10-07T11:11:14Z line ${i}`);
    const raw = ["job\tstep\t2026-10-07T11:11:14Z ##[group]Run pnpm test", "job\tstep\t2026-10-07T11:11:14Z ##[endgroup]", ...body, "job\tstep\t2026-10-07T11:11:14Z ##[error]boom"].join("\n");
    expect(trimFailedLog(raw, 11)).toMatchObject({ step: "pnpm test", omitted: 0 });
    expect(trimFailedLog(raw, 11).lines).toHaveLength(11);
    const over = trimFailedLog(raw, 10);
    expect(over.omitted).toBe(1);
    expect(over.lines).toHaveLength(10);
    expect(over.lines.at(-1)).toBe("error: boom");
  });

  it("without an error marker, keeps the last lines before cleanup", () => {
    const raw = ["a", "b", "c", "Post job cleanup.", "git version"].map((t) => `job\tstep\t2026-10-07T11:11:14Z ${t}`).join("\n");
    expect(trimFailedLog(raw, 2)).toEqual({ step: undefined, lines: ["b", "c"], omitted: 0, omittedAfter: 2 });
  });
});

describe("isLabelRace", () => {
  const race = "✗ [agent-review] agent-reviewed label is not applied, so the PR is not marked merge-ready.";
  it("needs a conventions check whose every blocking line is the label", () => {
    expect(isLabelRace("pr / conventions", [race, "1 blocking issue(s)."])).toBe(true);
    expect(isLabelRace("node / check", [race])).toBe(false);
    expect(isLabelRace("pr / conventions", [race, "✗ [tests] source changed with no test change"])).toBe(false);
    expect(isLabelRace("pr / conventions", ["error: Process completed with exit code 1."])).toBe(false);
  });
});
