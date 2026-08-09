import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  scripts: Record<string, string>;
  files?: string[];
  exports?: Record<string, string>;
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
    expect(existsSync(new URL("../dist/index.js", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../dist/design/index.js", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../dist/cli/index.js", import.meta.url))).toBe(true);
  });
});
