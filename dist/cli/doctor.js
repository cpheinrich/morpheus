import { doctor, formatFindings } from "../doctor/index.js";
import { readRegistry } from "../registry/index.js";
import { offlineDeclared } from "../session/gate.js";
/**
 * Report drift for one project, or every registered project with --all.
 *
 * `offline` defaults to the same declaration everything else reads, because
 * `doctor` now makes one network call per project — a command that was
 * filesystem-only and instant would otherwise block on a 15s `ls-remote`
 * timeout seven times over on a plane, with `MORPHEUS_OFFLINE=1` exported and
 * doing nothing.
 */
export async function run(cwd, all, offline) {
    const roots = all
        ? (await readRegistry()).projects.map((p) => ({ label: `${p.prefix}  ${p.name}`, root: p.path }))
        : [{ label: "", root: cwd }];
    if (roots.length === 0) {
        console.log("No projects registered. Run `morpheus registry add` in a project.");
        return 0;
    }
    let errors = 0;
    for (const { label, root } of roots) {
        const findings = await doctor({ root, offline: offlineDeclared(offline) });
        errors += findings.filter((f) => f.severity === "error").length;
        console.log(formatFindings(findings, all ? label : undefined));
        if (all)
            console.log();
    }
    return errors > 0 ? 1 : 0;
}
//# sourceMappingURL=doctor.js.map