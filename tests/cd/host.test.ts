import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { config } from "./fixtures.js";

const integration = fileURLToPath(new URL("./host-integration.sh", import.meta.url));

describe("macOS CD V2 host templates", () => {
  it("renders and executes the tick and worker with pinned inputs and safe credential isolation", () => {
    const output = execFileSync("/bin/bash", [integration], { encoding: "utf8", timeout: 30_000 });
    expect(output).toContain("Results: PASS=61 FAIL=0");
  });

  it("loads the installed real runtime and validates configuration without provider calls", () => {
    const directory = mkdtempSync(join(tmpdir(), "cd-host-runtime-"));
    try {
      const configPath = join(directory, "cd.json");
      writeFileSync(configPath, JSON.stringify(config()));
      const cli = fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url));
      const result = JSON.parse(execFileSync(process.execPath, [cli, "cd", "config", "--config", configPath], { encoding: "utf8", timeout: 10_000 }));
      expect(result.valid).toBe(true);
      expect(result.config.repository).toBe("example/app");
      expect(result.config.schemaVersion).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
