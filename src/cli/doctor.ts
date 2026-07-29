import { doctor, formatFindings } from "../doctor/index.js";
import { readRegistry } from "../registry/index.js";

/** Report drift for one project, or every registered project with --all. */
export async function run(cwd: string, all: boolean): Promise<number> {
  const roots = all
    ? (await readRegistry()).projects.map((p) => ({ label: `${p.prefix}  ${p.name}`, root: p.path }))
    : [{ label: "", root: cwd }];

  if (roots.length === 0) {
    console.log("No projects registered. Run `morpheus registry add` in a project.");
    return 0;
  }

  let errors = 0;
  for (const { label, root } of roots) {
    const findings = await doctor({ root });
    errors += findings.filter((f) => f.severity === "error").length;
    console.log(formatFindings(findings, all ? label : undefined));
    if (all) console.log();
  }

  return errors > 0 ? 1 : 0;
}
