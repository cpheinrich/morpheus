import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

// The action's own node:test suite, run as a child so it stays dependency-free. On failure the
// child's report is the only diagnosis there is, so it is surfaced rather than swallowed: two CI
// runs on cpheinrich/morpheus#396 reported only "execFileSync threw" for a stale assertion.
it("exercises disposable iOS simulator ownership and cleanup", () => {
  try {
    execFileSync(process.execPath, ["--test", ".github/actions/ios-simulator/simulator.test.mjs"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; status?: number | null };
    const report = `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`
      .split("\n")
      .filter((line) => /^not ok|^\s+(AssertionError|Error|at |actual:|expected:)/.test(line) || /^\s+# |^ℹ (pass|fail)/.test(line))
      .join("\n");
    expect.fail(`simulator.test.mjs exited ${String(failed.status)}:\n${report}`);
  }
});
