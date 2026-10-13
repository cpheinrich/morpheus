import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("exercises disposable iOS simulator ownership and cleanup", () => {
  expect(() => execFileSync(process.execPath, ["--test", ".github/actions/ios-simulator/simulator.test.mjs"], {
    encoding: "utf8",
  })).not.toThrow();
});
