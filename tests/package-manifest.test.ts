import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string>; files?: string[]; exports?: Record<string, string> };

describe("the manifest a consumer installs against", () => {
  it("runs `prepare` without assuming the consumer's package manager", () => {
    // A git dependency is built by whatever installed it, in a temp clone with
    // that tool on PATH and nothing else. `pnpm build` here made the kit
    // uninstallable by npm — `sh: 1: pnpm: not found`, exit 127 — which took
    // cpheinrich.com's CI down on the first real adoption. It passed locally
    // only because pnpm happened to be installed globally.
    expect(manifest.scripts.prepare).toBeDefined();
    expect(manifest.scripts.prepare).not.toMatch(/\b(pnpm|yarn|bun)\b/);
  });

  it("keeps every install-time script package-manager-agnostic", () => {
    // `prepare` is the one npm runs for a git dependency today, but any of
    // these would run in the same borrowed environment.
    for (const hook of ["prepare", "prepack", "postinstall", "preinstall", "install"]) {
      const script = manifest.scripts[hook];
      if (script) expect(script, hook).not.toMatch(/\b(pnpm|yarn|bun)\b/);
    }
  });

  it("ships dist, which is what the built output lands in", () => {
    // dist/ is gitignored, so a git-dependency consumer has nothing until
    // `prepare` runs. If `files` ever stops listing it the failure is a
    // module-not-found in the consumer, far from here.
    expect(manifest.files).toContain("dist");
  });
});
