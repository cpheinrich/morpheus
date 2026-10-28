import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { readRegistry } from "../registry/index.js";
import { buildReport, extract, renderReport, sinceMs, summarizeIssues, toJsonl } from "../profile/index.js";
/** Registered project paths, so `evo/apps/ios` attributes to `evo`. Missing registry is fine. */
async function roots() {
    try {
        return (await readRegistry()).projects.map((p) => p.path);
    }
    catch {
        return [];
    }
}
async function run(flags) {
    if (sinceMs(flags.since) === null) {
        console.error(`--since must be a real calendar date in YYYY-MM-DD, got "${flags.since}".`);
        return null;
    }
    return extract({ since: flags.since, repo: flags.repo, roots: await roots() });
}
function reportIssues(x) {
    for (const line of summarizeIssues(x.issues, { home: homedir() }))
        console.error(line);
}
/** `morpheus profile extract` — JSONL rows to `--out` or stdout. */
export async function profileExtract(flags) {
    const x = await run(flags);
    if (!x)
        return 1;
    const text = toJsonl([...x.sessions, ...x.spans]);
    if (flags.out) {
        await writeFile(flags.out, text, "utf8");
        const dup = x.duplicates ? ` (${x.duplicates} duplicate Codex cop${x.duplicates === 1 ? "y" : "ies"} counted once)` : "";
        console.error(`Wrote ${x.sessions.length} sessions and ${x.spans.length} spans from ${x.files} files to ${flags.out}${dup}.`);
    }
    else {
        process.stdout.write(text);
    }
    reportIssues(x);
    return 0;
}
/** `morpheus profile report` — the human summary, or `--json`. */
export async function profileReport(flags) {
    const x = await run(flags);
    if (!x)
        return 1;
    const report = buildReport(x.sessions, x.spans, { duplicates: x.duplicates });
    if (flags.json) {
        console.log(JSON.stringify(report, null, 2));
    }
    else {
        const scope = [flags.since ? `since ${flags.since}` : "all time", flags.repo ? `repo ~ "${flags.repo}"` : null]
            .filter(Boolean)
            .join(", ");
        console.log(renderReport(report, `Agent session profile — ${scope}`));
    }
    reportIssues(x);
    return 0;
}
//# sourceMappingURL=profile.js.map