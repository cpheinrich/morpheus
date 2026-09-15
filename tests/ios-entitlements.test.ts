import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("TestFlight entitlement preservation", () => {
  it("exercises preparation, export rejection, and native signing when available", () => {
    expect(() => execFileSync("python3", ["tests/ios_entitlements_test.py"], {
      encoding: "utf8",
    })).not.toThrow();
  });
});
