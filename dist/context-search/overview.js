import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { ROADMAP_ID } from "../pm/id.js";
import { INSTALL_RECEIPT, MORPHEUS_PACKAGE_ROOT, MORPHEUS_REMOTE } from "../self.js";
import { getSearchConfig } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";
const ARCHITECTURE = [
    { title: "Project manifest", anchor: "4-the-project-manifest" },
    { title: "Instruction layering", anchor: "71-instruction-layering" },
    { title: "The work loop", anchor: "73-the-work-loop" },
    { title: "Agent records", anchor: "75-agent-records" },
    { title: "Context freshness", anchor: "710-context-freshness" },
    { title: "Project management", anchor: "8-project-management-as-files" },
    { title: "Factory distribution and responsibilities", anchor: "18-distribution-three-mechanisms" },
];
async function jsonRecord(path) {
    try {
        const value = JSON.parse(await readFile(path, "utf8"));
        if (value && typeof value === "object" && !Array.isArray(value))
            return value;
    }
    catch {
        // A fresh checkout can lack optional package metadata and install receipts.
    }
    return {};
}
function packagePin(manifest) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        const group = manifest[field];
        const spec = group?.["morpheus-kit"];
        if (typeof spec !== "string")
            continue;
        const match = /^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)cpheinrich\/morpheus(?:\.git)?#([a-f\d]{40})$/i.exec(spec);
        if (match)
            return match[1];
    }
}
async function architectureRef(kit, isMorpheus) {
    if (isMorpheus)
        return "architecture.md";
    const receipt = await jsonRecord(join(MORPHEUS_PACKAGE_ROOT, INSTALL_RECEIPT));
    const installedPin = receipt.schema === 1 && receipt.remote === MORPHEUS_REMOTE &&
        typeof receipt.commit === "string" && /^[a-f\d]{40}$/i.test(receipt.commit) ? receipt.commit : undefined;
    return `https://github.com/cpheinrich/morpheus/blob/${packagePin(kit) ?? installedPin ?? "main"}/architecture.md`;
}
/**
 * Where each heading's section sits in a local Markdown record, keyed by its GitHub anchor.
 * A section runs to the next heading of the same or a higher level.
 */
function sectionRanges(text) {
    const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
    const headings = [];
    let fenced = false;
    lines.forEach((line, index) => {
        // A `#` line inside a code fence is a comment, not a heading.
        if (/^\s*(```|~~~)/.test(line))
            fenced = !fenced;
        const heading = fenced ? null : /^(#{1,6}) +(.+?)\s*$/.exec(line);
        if (!heading)
            return;
        const anchor = heading[2].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
        headings.push({ anchor, level: heading[1].length, line: index + 1 });
    });
    const ranges = new Map();
    headings.forEach(({ anchor, level, line }, index) => {
        const next = headings.slice(index + 1).find(later => later.level <= level);
        // GitHub gives a repeated heading a numbered anchor; the plain one is the first.
        if (!ranges.has(anchor))
            ranges.set(anchor, { from: line, end: (next?.line ?? lines.length + 1) - 1 });
    });
    return ranges;
}
/**
 * `href` is the link a person follows. `read` is the exact `read_project_record` input for the
 * section, present only when the specification is a local, indexed record: a pinned GitHub
 * link is never fetched as a record read. One read takes at most 100 lines, so `sectionEnd`
 * says how far a longer section runs past `read.to`.
 */
async function architectureSections(root, architecture, included) {
    const [local] = included.includes(architecture) ? await readContextSources(root, [architecture]) : [];
    const ranges = local ? sectionRanges(local.text) : undefined;
    return ARCHITECTURE.map(({ title, anchor }) => {
        const range = ranges?.get(anchor);
        const located = range && { read: { path: architecture, from: range.from, to: Math.min(range.end, range.from + 99) }, sectionEnd: range.end };
        return { title, href: `${architecture}#${anchor}`, ...located };
    });
}
/** Portable pointers for a fresh agent. Contents and absolute host paths stay in the project. */
export async function contextOverview(root, task) {
    const [manifest, kit] = await Promise.all([
        jsonRecord(join(root, "morpheus.json")),
        jsonRecord(join(root, "package.json")),
    ]);
    const isMorpheus = manifest.name === "morpheus" && manifest.prefix === "MO" && kit.name === "morpheus-kit";
    const [architecture, sources] = await Promise.all([
        architectureRef(kit, isMorpheus),
        getSearchConfig(root).then(config => discoverSources(root, config)),
    ]);
    const sections = await architectureSections(root, architecture, sources.included);
    const taskId = task && ROADMAP_ID.test(task) ? task : undefined;
    const roadmap = taskId ? sources.included.find(path => {
        const file = posix.basename(path);
        return path.startsWith("hq/product/roadmap/") && (file === taskId + ".md" || file.startsWith(taskId + "-"));
    }) : undefined;
    return {
        project: typeof manifest.name === "string" ? manifest.name.slice(0, 128) : undefined,
        architecture: { source: architecture, sections },
        projectRecords: [
            { purpose: "Project-specific agent instructions", path: "AGENTS.md" },
            { purpose: "Project settings and search scope", path: "morpheus.json" },
            ...sources.included.filter(path => [".agent/context-core.md", ".agent/decisions.md", ".agent/learned.md"].includes(path))
                .map(path => ({ purpose: "Governing project context", path })),
            { purpose: "Planned and claimed work", path: "hq/product/roadmap/" },
            { purpose: "Prior work and evidence", path: ".agent/worklog/" },
        ],
        task: taskId ? { id: taskId, roadmap, next: "Open the roadmap item and traverse its explicit links to find related worklogs and PRs." } : undefined,
        operatingModel: [
            "Use the Factory handoff and the active worktree as the task scope. Read project instructions and required startup records first.",
            "Use the roadmap as the claim and acceptance record. Read governing decisions and prior work before implementation.",
            "Record what happened in the worklog and link the governing records, prior attempts and follow-up work.",
            "Keep work on its claimed branch. Use independent review and CI before protected delivery.",
        ],
        handoff: "Use the task scope, acceptance criteria, and handoff supplied by the Factory controller. Consult project instructions and the linked architecture sections before acting.",
    };
}
//# sourceMappingURL=overview.js.map