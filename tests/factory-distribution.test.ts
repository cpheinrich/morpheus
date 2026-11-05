import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

// Anything that would install, register or switch on the personal Factory plugin: its
// package path, its private settings directory, a marketplace id, or one of its variables.
const FACTORY = /plugins\/factory|share\/factory|factory@|FACTORY_/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("Factory stays out of normal Morpheus distribution", () => {
  it("is never named by init, the CLI, self install/update or the session and bootstrap shims", () => {
    // src/ holds init templates, `self install`/`self update`/`self ensure` and the bootstrap
    // and session-start generators; .morpheus/ holds the copies a checkout runs.
    const scanned = [...files(join(root, "src")), ...files(join(root, ".morpheus"))];
    expect(scanned.some((path) => path.endsWith(join("src", "self.ts")))).toBe(true);
    expect(scanned.some((path) => path.endsWith(join(".morpheus", "bootstrap.sh")))).toBe(true);
    const offenders = scanned.filter((path) => FACTORY.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });

  it("is not in the package that self install packs", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { files: string[] };
    expect(manifest.files.filter((entry) => entry.startsWith("plugins"))).toEqual([]);
  });

  it("ships experimental and off in its own repository-owned package", () => {
    const plugin = (path: string) => readFileSync(join(root, "plugins/factory", path), "utf8");
    expect(plugin("src/config.mjs")).toMatch(/release = Object\.freeze\(\{ status: "experimental", defaultMode: "off" \}\)/);
    for (const manifest of [".codex-plugin/plugin.json", "claude-plugin/.claude-plugin/plugin.json"])
      expect(JSON.parse(plugin(manifest)).description, manifest).toMatch(/^Experimental, off until enabled on this machine\./);
  });

  it("keeps the host package out of normal install and runs its whole suite in Factory CI", () => {
    const host = JSON.parse(readFileSync(join(root, "plugins/factory/src/host/package.json"), "utf8")) as {
      name: string; scripts: Record<string, string>;
    };
    expect(host.name).toBe("@morpheus/factory-host");
    // Its own workspace file and lockfile keep `pnpm install` there from joining the root.
    for (const own of ["pnpm-workspace.yaml", "pnpm-lock.yaml", "vitest.config.ts"])
      expect(readdirSync(join(root, "plugins/factory/src/host"))).toContain(own);
    expect(host.scripts.test).toContain("vitest run");
    expect(host.scripts.test).toContain("unittest discover");
    const ci = load(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: Record<string, { steps: Array<{ "working-directory"?: string; run?: string }> }>;
    };
    const step = ci.jobs.factory!.steps.find((s) => s["working-directory"] === "plugins/factory/src/host");
    expect(step?.run?.split("\n").map((line) => line.trim()).filter(Boolean)).toEqual([
      "pnpm install --frozen-lockfile", "pnpm check", "pnpm typecheck", "pnpm test", "pnpm build",
    ]);
  });
});

