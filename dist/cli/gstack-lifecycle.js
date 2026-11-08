import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import matter from "@11ty/gray-matter";
const STAGES = ["plan", "review", "verify", "monitor"];
const SURFACES = ["general", "web", "ios", "cli"];
const HANDOFFS = {
    autoplan: {
        skill: "autoplan",
        provide: "Claimed task brief, worktree, acceptance, and open decisions.",
        returnToMorpheus: "Link the amended plan, test plan, and open decisions in the task worklog.",
    },
    review: {
        skill: "review",
        provide: "Exact diff and acceptance criteria. Apply edits only within the current task's authority.",
        returnToMorpheus: "Include findings and dispositions in the independent review packet.",
    },
    qa: {
        skill: "qa-only",
        provide: "Changed flows and a runnable, authorized web preview or isolated CLI target.",
        returnToMorpheus: "Include reproducible findings and evidence paths in the independent review packet.",
    },
    verify: {
        skill: "verify",
        provide: "Project build and focused test commands, changed behavior, and exact source revision.",
        returnToMorpheus: "Record commands, results, and gaps in the PR test plan.",
    },
    canary: {
        skill: "canary",
        provide: "Authorized web URL, release identity, baseline, and observation deadline.",
        returnToMorpheus: "Return observations and evidence to the existing release owner.",
    },
};
const ROUTES = {
    plan: { general: [HANDOFFS.autoplan] },
    review: {
        general: [HANDOFFS.review],
        web: [HANDOFFS.review, HANDOFFS.qa],
        cli: [HANDOFFS.review, HANDOFFS.qa],
    },
    verify: { general: [HANDOFFS.verify] },
    monitor: { web: [HANDOFFS.canary] },
};
const USAGE = "morpheus skills lifecycle <plan|review|verify|monitor> <general|web|ios|cli> " +
    "[--gstack --host <codex|claude>] [--skills-dir <path>] [--json]";
function skillRoots(host, cwd, override) {
    if (override)
        return [resolve(cwd, override)];
    const home = homedir();
    if (host === "claude") {
        return [join(cwd, ".claude", "skills"), join(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "skills")];
    }
    return [
        join(cwd, ".agents", "skills"),
        join(home, ".agents", "skills"),
        join(process.env.CODEX_HOME || join(home, ".codex"), "skills"),
    ];
}
async function findSkill(roots, host, skill) {
    const prefixed = `gstack-${skill}`;
    for (const root of roots) {
        const paths = [join(root, prefixed, "SKILL.md")];
        if (host === "claude")
            paths.push(join(root, "gstack", skill, "SKILL.md"));
        for (const path of paths) {
            const source = await readFile(path, "utf8").catch((error) => {
                if (error.code === "ENOENT" || error.code === "ENOTDIR")
                    return undefined;
                throw error;
            });
            if (source === undefined)
                continue;
            const { name } = matter(source).data;
            if (name === prefixed || name === skill)
                return { name, path };
            throw new Error(`Unexpected gstack skill name in ${path}.`);
        }
    }
    return null;
}
async function resolveHandoffs(stage, surface, host, cwd, override) {
    const routes = ROUTES[stage][surface] ?? ROUTES[stage].general ?? [];
    const roots = skillRoots(host, cwd, override);
    return Promise.all(routes.map(async (handoff) => ({
        ...handoff,
        installed: await findSkill(roots, host, handoff.skill),
    })));
}
function readOptions(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            gstack: { type: "boolean" },
            host: { type: "string" },
            "skills-dir": { type: "string" },
            json: { type: "boolean" },
        },
    });
    const [stage, surface] = positionals;
    if (positionals.length !== 2 || !STAGES.includes(stage) || !SURFACES.includes(surface)) {
        throw new Error(USAGE);
    }
    const host = values.host === "codex" || values.host === "claude" ? values.host : undefined;
    if ((values.host !== undefined || values.gstack) && !host) {
        throw new Error("--host must be codex or claude when gstack routing is enabled.");
    }
    return { values, stage: stage, surface: surface, host };
}
export async function runGstackLifecycle(argv, cwd = process.cwd()) {
    if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
        console.log(USAGE);
        return 0;
    }
    const { values, stage, surface, host } = readOptions(argv);
    const routes = values.gstack && host
        ? await resolveHandoffs(stage, surface, host, cwd, values["skills-dir"])
        : [];
    const result = { enabled: values.gstack === true, stage, surface, routes };
    if (values.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
    }
    console.log(`gstack ${result.enabled ? "on" : "off"} · ${stage} · ${surface}`);
    for (const { skill, installed, provide, returnToMorpheus } of routes) {
        if (!installed) {
            console.log(`  ${skill}: unavailable`);
            continue;
        }
        console.log(`  ${installed.name} · ${installed.path}\n    Provide: ${provide}\n    Return: ${returnToMorpheus}`);
    }
    console.log("Morpheus owns task state, independent review, and delivery.");
    return 0;
}
//# sourceMappingURL=gstack-lifecycle.js.map