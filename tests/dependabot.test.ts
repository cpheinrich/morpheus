import { describe, expect, it } from "vitest";
import {
  decideByPolicy,
  isDependencyFile,
  isDependencyOnly,
  parseDependabotTitle,
  shouldAdvanceAutoMerge,
  updateType,
  type DependabotPolicy,
} from "../src/dependabot/policy.js";

const policy: DependabotPolicy = {
  version: 1,
  autoMerge: [
    { dependency: "ruff", updateTypes: ["version-update:semver-patch"] },
  ],
  close: [
    {
      dependency: "@types/node",
      updateTypes: ["version-update:semver-major"],
      reason: "types must match the deployed Node major",
    },
  ],
};

describe("Dependabot update metadata", () => {
  it("parses scoped packages and their directory", () => {
    expect(
      parseDependabotTitle("Build(deps-dev): bump @types/node from 22.20.1 to 26.4.0 in /apps/web"),
    ).toEqual({
      dependency: "@types/node",
      fromVersion: "22.20.1",
      toVersion: "26.4.0",
      directory: "/apps/web",
      updateType: "version-update:semver-major",
    });
  });

  it("normalizes backticked git SHAs from Dependabot titles", () => {
    expect(
      parseDependabotTitle(
        "Build(deps): bump morpheus-kit from `9f8ec92` to `3b8a44c` in /apps/web",
      ),
    ).toEqual(
      expect.objectContaining({
        dependency: "morpheus-kit",
        fromVersion: "9f8ec92",
        toVersion: "3b8a44c",
        updateType: "version-update:git-commit",
      }),
    );
  });

  it("does not invent metadata for grouped updates", () => {
    expect(parseDependabotTitle("Bump the npm group in /apps/web with 3 updates")).toBeNull();
  });

  it.each([
    ["1.2.3", "2.0.0", "version-update:semver-major"],
    ["1.2.3", "1.3.0", "version-update:semver-minor"],
    ["1.2.3", "1.2.4", "version-update:semver-patch"],
    ["9f8ec92", "3b8a44c", "version-update:git-commit"],
  ] as const)("classifies %s to %s", (from, to, expected) => {
    expect(updateType(from, to)).toBe(expected);
  });
});

describe("dependency-only scope", () => {
  it.each([
    "apps/web/package.json",
    "apps/web/package-lock.json",
    "apps/backend/pyproject.toml",
    "apps/backend/uv.lock",
    "requirements-dev.txt",
  ])("allows %s", (path) => expect(isDependencyFile(path)).toBe(true));

  it.each([
    ".github/dependabot.yml",
    ".github/workflows/ci.yml",
    "apps/web/app/page.tsx",
    "apps/backend/src/lakina/broker.py",
  ])("refuses %s", (path) => expect(isDependencyFile(path)).toBe(false));

  it("refuses an empty file list instead of treating absence as assent", () => {
    expect(isDependencyOnly([])).toBe(false);
  });
});

describe("auto-merge convergence", () => {
  it("advances only approved heads that are behind their protected base", () => {
    expect(shouldAdvanceAutoMerge("auto_merge", "BEHIND")).toBe(true);
    expect(shouldAdvanceAutoMerge("auto_merge", "CLEAN")).toBe(false);
    expect(shouldAdvanceAutoMerge("human_review", "BEHIND")).toBe(false);
    expect(shouldAdvanceAutoMerge("close", "BEHIND")).toBe(false);
  });
});

describe("deterministic policy", () => {
  const base = {
    author: "dependabot[bot]",
    title: "Bump ruff from 0.16.4 to 0.16.5 in /apps/backend",
    changedFiles: ["apps/backend/pyproject.toml", "apps/backend/uv.lock"],
  };

  it("auto-merges only an explicitly listed update", () => {
    expect(decideByPolicy(policy, base).route).toBe("auto_merge");
  });

  it("closes an explicitly held update with its recorded reason", () => {
    const decision = decideByPolicy(policy, {
      ...base,
      title: "Bump @types/node from 22.20.1 to 26.4.0 in /apps/web",
      changedFiles: ["apps/web/package.json", "apps/web/package-lock.json"],
    });
    expect(decision).toEqual({
      route: "close",
      reason: "types must match the deployed Node major",
    });
  });

  it("sends an unmatched dependency to the agent", () => {
    expect(
      decideByPolicy(policy, {
        ...base,
        title: "Bump next from 16.3.2 to 16.3.3 in /apps/web",
      }).route,
    ).toBe("agent");
  });

  it("never trusts a non-Dependabot author or a source change", () => {
    expect(decideByPolicy(policy, { ...base, author: "someone" }).route).toBe("human_review");
    expect(
      decideByPolicy(policy, {
        ...base,
        changedFiles: [...base.changedFiles, "apps/backend/src/lakina/risk.py"],
      }).route,
    ).toBe("human_review");
  });
});
