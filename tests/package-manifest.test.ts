import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  scripts: Record<string, string>;
  files?: string[];
  exports?: Record<string, string>;
  bin?: Record<string, string>;
  workspaces?: unknown;
};

describe("the manifest a consumer installs against", () => {
  it("does not trigger a build when installed from git", () => {
    // npm treats any of these scripts — or a workspace root — as a request to
    // clone, install devDependencies, and rebuild a git dependency. pnpm 11
    // refuses that prepare phase unless the consumer allowlists the resolved
    // codeload URL, which makes a moving git ref unusable. The kit commits its
    // platform-independent output instead.
    for (const script of [
      "build",
      "prepare",
      "prepack",
      "preinstall",
      "install",
      "postinstall",
    ]) {
      expect(manifest.scripts[script], script).toBeUndefined();
    }
    expect(manifest.workspaces).toBeUndefined();
    expect(manifest.scripts.compile).toBeDefined();
  });

  it("ships prebuilt dist artifacts", () => {
    // Tests run before CI compiles. These assertions therefore prove that a
    // clean checkout already has the package entry points a consumer needs;
    // CI compiles afterwards and fails if doing so changes the committed tree.
    expect(manifest.files).toContain("dist");
    const exports = Object.entries(manifest.exports ?? {});
    const bins = Object.entries(manifest.bin ?? {});
    expect(exports.length, "exports").toBeGreaterThan(0);
    expect(bins.length, "bin").toBeGreaterThan(0);
    for (const [subpath, target] of exports) {
      expect(existsSync(new URL(`../${target}`, import.meta.url)), subpath).toBe(true);
    }
    for (const [name, target] of bins) {
      const path = new URL(`../${target}`, import.meta.url);
      expect(existsSync(path), name).toBe(true);
      expect(statSync(path).mode & 0o111, `${name} should be executable`).not.toBe(0);
    }
  });
});
