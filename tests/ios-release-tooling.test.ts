import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "js-yaml";
import { expect, it } from "vitest";

type Step = { name?: string; run?: string; env?: Record<string, string> };
const composite = load(
  readFileSync(new URL("../.github/actions/ios-testflight-upload/action.yml", import.meta.url), "utf8"),
) as { runs: { steps: Step[] } };
const reusable = load(
  readFileSync(new URL("../.github/workflows/ios-nightly-build.yml", import.meta.url), "utf8"),
) as { jobs: Record<string, { steps?: Step[] }> };

const stubs = `
brew() { return 0; }
uname() { printf '%s\\n' "$TEST_ARCH"; }
curl() {
  printf '%s\\n' "$*"
  case "$*" in
    *github.com/tddworks/asc-cli/releases/download/*) return 22 ;;
    *api.github.com/repos/tddworks/asc-cli/releases/assets/*)
      printf '#!/bin/bash\\necho unexpectedly executed\\n' > "\${!#}" ;;
    *) return 99 ;;
  esac
}
`;

for (const [lane, steps] of [
  ["composite", composite.runs.steps],
  ["reusable", Object.values(reusable.jobs).flatMap((job) => job.steps ?? [])],
] as const) {
  it.each([["arm64", 478751700], ["x86_64", 478751702]])(
    `${lane} falls back for %s and rejects a corrupt asset`,
    (arch, assetId) => {
      const step = steps.find((candidate) => candidate.name === "Install release tooling");
      expect(step?.run).toBeTypeOf("string");
      const temp = mkdtempSync(join(tmpdir(), "morpheus-asccli-"));
      try {
        const result = spawnSync("bash", ["-c", stubs + step!.run], {
          encoding: "utf8",
          env: {
            PATH: process.env.PATH, ASCCLI_VERSION: step?.env?.ASCCLI_VERSION,
            INSTALL_SENTRY_CLI: "false", TEST_ARCH: arch, RUNNER_TEMP: temp,
            GITHUB_PATH: join(temp, "path"), GITHUB_ENV: join(temp, "env"),
          },
        });
        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain(`/releases/download/v0.18.2/asc_v0.18.2_macOS_${arch}`);
        expect(result.stdout).toContain(`--header Accept: application/octet-stream https://api.github.com/repos/tddworks/asc-cli/releases/assets/${assetId} --output`);
        expect(result.stdout).toContain("asccli: FAILED");
        expect(result.stdout).not.toContain("unexpectedly executed");
        expect(result.status).toBe(1);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  );
}
