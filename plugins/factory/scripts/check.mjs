import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
for (const dir of ["src", "scripts", "tests"])
  for (const name of await readdir(new URL(`../${dir}/`, import.meta.url)))
    if (name.endsWith(".mjs"))
      execFileSync(
        process.execPath,
        ["--check", new URL(`../${dir}/${name}`, import.meta.url).pathname],
        { stdio: "inherit" },
      );
execFileSync(
  "python3",
  ["-c", 'import ast; ast.parse(open("src/guardian.py").read())'],
  { cwd: new URL("..", import.meta.url), stdio: "inherit" },
);
