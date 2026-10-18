import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("emits the same team schema when unrelated literals are checked first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morpheus-enum-order-"));
  try {
    const prime = join(directory, "prime.ts"), schema = resolve("src/team/schema.ts");
    await writeFile(prime, 'export const value: "manual" = "manual";\n');
    const config = ts.readConfigFile(resolve("tsconfig.build.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
    const emit = (roots: string[]) => {
      const program = ts.createProgram(roots, { ...parsed.options, rootDir: undefined });
      // TypeScript interns literal types while checking; reproduce both orders.
      for (const root of roots) program.getSemanticDiagnostics(program.getSourceFile(root));
      let declaration = "";
      program.emit(program.getSourceFile(schema), (path, value) => { if (path.endsWith("/team/schema.d.ts")) declaration = value; }, undefined, true);
      expect(declaration).toContain("export declare const NoteSource"); return declaration;
    };
    expect(emit([prime, schema])).toBe(emit([schema, prime]));
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 20_000);
