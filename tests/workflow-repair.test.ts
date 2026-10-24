import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("workflow repair experiment controls", () => {
  it("verifies the schedule, freeze, trace parsing and isolated grader", () => {
    // Seatbelt requires Apple's framework interpreter. Linux runs the portable
    // campaign tests and explicitly skips native macOS qualification.
    const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
    const result = spawnSync(python, ["-m", "unittest", "discover", "-s", "qa/evals/workflow-repair", "-p", "test_*.py"], {
      encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/Ran 33 tests/);
    expect(result.stderr).toMatch(/OK/);
  });
});
