import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

const exec = promisify(execFile);
const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const eslint = join(dirname(require.resolve("eslint/package.json")), "bin/eslint.js");

describe("repository lint contract", () => {
  it("runs the configured checker and rejects an unused TypeScript declaration", async () => {
    // A real source path supplies the config and TS parser without creating
    // a fixture in src or depending on an optional system ESLint install.
    const run = (source: string) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = execFile(process.execPath, [eslint, "--stdin", "--stdin-filename", "src/lint-fixture.ts"], { cwd: root }, (error, stdout) => {
        if (error && typeof error.code !== "number") { reject(error); return; }
        resolve({ code: error ? Number(error.code) : 0, output: stdout });
      });
      child.stdin!.end(source);
    });
    expect(await run('export const used = 1;\n')).toEqual({ code: 0, output: "" });
    const invalid = await run('const unused = 1;\n');
    expect(invalid.code).toBe(1);
    expect(invalid.output).toContain("@typescript-eslint/no-unused-vars");
  });

  it("keeps lint installed and enabled in the CI caller", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const workflow = load(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")) as { jobs: { node: { with: Record<string, unknown> } } };
    expect(manifest.scripts.lint).toBe("eslint src");
    expect(manifest.devDependencies.eslint).toBeTruthy();
    expect(manifest.devDependencies["typescript-eslint"]).toBeTruthy();
    expect(workflow.jobs.node.with["run-lint"]).toBe(true);
    expect((await exec(process.execPath, [eslint, "--version"], { cwd: root })).stdout).toMatch(/^v10\./);
  });
});
