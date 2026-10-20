import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const integration = fileURLToPath(new URL("./host-integration.sh", import.meta.url));

describe("macOS CD V2 host templates", () => {
  it("renders and executes the tick and worker with pinned inputs and safe credential isolation", () => {
    const output = execFileSync("/bin/bash", [integration], { encoding: "utf8", timeout: 30_000 });
    expect(output).toContain("Results: PASS=41 FAIL=0");
  });
});
