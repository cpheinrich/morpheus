import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import matter from "@11ty/gray-matter";
import { ensureGstack } from "./gstack-install.js";
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
function readIfPresent(path) {
    return readFile(path, "utf8").catch((error) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR")
            return undefined;
        throw error;
    });
}
async function findSkill(root, host, skill) {
    const prefixed = `gstack-${skill}`;
    const entries = host === "claude" ? [prefixed, skill] : [prefixed];
    for (const entry of entries) {
        const dir = join(root, entry);
        // Claude's installer owns flat entrypoints. The nested payload can remain after disabling one.
        if (host === "claude" && !(await readIfPresent(join(dir, ".gstack-owned")))?.trim())
            continue;
        const path = join(dir, "SKILL.md");
        const source = await readIfPresent(path);
        if (source === undefined)
            continue;
        const { name } = matter(source).data;
        if (name !== prefixed && name !== skill)
            throw new Error(`Unexpected gstack skill name in ${path}.`);
        return { name: host === "claude" ? entry : name, path };
    }
    return null;
}
async function resolveHandoffs(routes, host, skills) {
    return Promise.all(routes.map(async (handoff) => ({
        ...handoff,
        installed: await findSkill(skills, host, handoff.skill),
    })));
}
async function lookupGstack(stage, surface, host, override) {
    const candidates = ROUTES[stage][surface] ?? ROUTES[stage].general ?? [];
    if (candidates.length === 0)
        return { routes: [] };
    if (override)
        return { routes: await resolveHandoffs(candidates, host, override) };
    try {
        const { skills, ...runtime } = await ensureGstack(host);
        return { routes: await resolveHandoffs(candidates, host, skills), runtime };
    }
    catch (error) {
        const setupError = error instanceof Error ? error.message : String(error);
        return { routes: [], setupError };
    }
}
function shellQuote(value) {
    return "'" + value.replaceAll("'", "'\"'\"'") + "'";
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
    const enabled = values.gstack === true;
    const override = values["skills-dir"];
    const lookup = enabled && host
        ? await lookupGstack(stage, surface, host, override && resolve(cwd, override))
        : { routes: [] };
    const result = { enabled, stage, surface, ...lookup };
    if (values.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
    }
    console.log(`gstack ${result.enabled ? "on" : "off"} · ${stage} · ${surface}`);
    if (result.setupError)
        console.log(`gstack unavailable. Continue with Morpheus. ${result.setupError}`);
    if (result.runtime) {
        const { release, env, pathPrefix } = result.runtime;
        const settings = Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`);
        console.log(`  Managed gstack ${release}. Read the skill by path. Resolve ~/ references using the managed HOME and apply these settings in a subshell for each gstack shell step.`);
        console.log(`  export ${settings.join(" ")} PATH=${shellQuote(pathPrefix)}:"$PATH"`);
    }
    for (const { skill, installed, provide, returnToMorpheus } of result.routes) {
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