import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const oxlint = join(dirname(require.resolve("oxlint/package.json")), "bin/oxlint");

describe("repository lint contract", () => {
  it("keeps TypeScript lint errors and the underscore exemption", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "morpheus-lint-"));
    try {
      await copyFile(join(root, ".oxlintrc.json"), join(fixture, ".oxlintrc.json"));
      await mkdir(join(fixture, "src"));
      const sourcePath = join(fixture, "src", "check.ts");
      const check = async (source: string) => {
        await writeFile(sourcePath, source);
        return spawnSync(process.execPath, [oxlint, "--format", "json", "src"], {
          cwd: fixture, encoding: "utf8", timeout: 10_000,
        });
      };
      const valid = await check("const _unused = 1;\nexport const used = 1;\n");
      expect(valid.status).toBe(0);
      expect(JSON.parse(valid.stdout)).toMatchObject({ diagnostics: [], number_of_files: 1 });

      const invalid = await check("const unused: any = 1;\n");
      expect(invalid.status).toBe(1);
      const codes = JSON.parse(invalid.stdout).diagnostics.map((diagnostic: { code: string }) => diagnostic.code);
      expect(codes.sort()).toEqual(["eslint(no-unused-vars)", "typescript(no-explicit-any)"]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("keeps lint installed and enabled in the CI caller", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const workflow = load(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")) as { jobs: { node: { with: Record<string, unknown> } } };
    expect(manifest.scripts.lint).toBe("oxlint src");
    expect(manifest.devDependencies.oxlint).toBeTruthy();
    expect(workflow.jobs.node.with["run-lint"]).toBe(true);
  });
});
