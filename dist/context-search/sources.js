import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimatch } from "minimatch";
import { sessionGit } from "../session/start.js";
export const CONTEXT_SOURCE_DEFAULTS = [
    "AGENTS.md", "architecture.md", ".agent/context-core.md", ".agent/decisions.md", ".agent/learned.md",
    ".agent/{decisions,learned,worklog}/**/*.md", "hq/product/**/*.md", "docs/**/*.md",
    "hq/team/meeting-notes/**/*.md",
];
const ignored = [
    "**/{node_modules,dist,build,local,.git}/**", ".agent/inbox-archive/**",
    "hq/team/*.md", ".agent/{review,reviews}/**", ".agent/README.md", "hq/product/{roadmap,goals,requests}/README.md",
];
const options = { dot: true, nonegate: true, nocomment: true };
const matches = (path, patterns) => patterns.some(pattern => minimatch(path, pattern, options));
const safePath = (path) => path.endsWith(".md") && !path.startsWith("/") && !path.split("/").some(part => part === ".." || part === ".");
export const CONTEXT_KINDS = ["decision", "lesson", "roadmap", "worklog", "runbook", "meeting_note", "other"];
const kindPaths = [
    ["decision", ".agent/decisions{.md,/**}"],
    ["lesson", ".agent/learned{.md,/**}"],
    ["roadmap", "hq/product/roadmap/**"],
    ["worklog", ".agent/worklog/**"],
    ["runbook", "docs/runbooks/**"],
    ["meeting_note", "hq/team/meeting-notes/**"],
];
export function contextKind(path) {
    return kindPaths.find(([, pattern]) => minimatch(path, pattern, options))?.[0] ?? "other";
}
export function classifySources(paths, rules) {
    const coverage = { included: [], excluded: [], uncovered: [], emptyPatterns: [] };
    const include = [...CONTEXT_SOURCE_DEFAULTS, ...rules.include];
    const markdown = [...new Set(paths.filter(safePath))].sort();
    for (const path of markdown) {
        if (matches(path, ignored) || matches(path, rules.exclude))
            coverage.excluded.push(path);
        else if (matches(path, include))
            coverage.included.push(path);
        else
            coverage.uncovered.push(path);
    }
    coverage.emptyPatterns = rules.include.filter(pattern => !matchesAny(coverage.included, pattern));
    return coverage;
}
function matchesAny(paths, pattern) {
    return paths.some(path => minimatch(path, pattern, options));
}
export async function discoverSources(root, rules) {
    const names = await sessionGit(root, ["ls-files", "-z", "--cached", "--", "*.md"], false);
    return classifySources(names.split("\0"), rules);
}
async function usableSource(absolute) {
    try {
        return await realpath(absolute) === absolute && (await stat(absolute)).isFile();
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
export async function contextCoverage(root, rules) {
    const coverage = await discoverSources(root, rules);
    const availability = await Promise.all(coverage.included.map(path => usableSource(join(root, path))));
    const included = coverage.included.filter((_, i) => availability[i]);
    return {
        ...coverage,
        included,
        unavailable: coverage.included.filter((_, i) => !availability[i]),
        emptyPatterns: rules.include.filter(pattern => !matchesAny(included, pattern)),
    };
}
export async function readContextSources(root, paths) {
    const sources = await Promise.all(paths.map(async (path) => {
        const absolute = join(root, path);
        try {
            if (!await usableSource(absolute))
                return null;
            return { path, text: await readFile(absolute, "utf8") };
        }
        catch (error) {
            if (error.code === "ENOENT")
                return null;
            throw error;
        }
    }));
    return sources.filter(source => source !== null);
}
//# sourceMappingURL=sources.js.map