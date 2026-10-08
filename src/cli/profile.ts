import { writeFile } from "node:fs/promises";
import { readRegistry } from "../registry/index.js";
import { buildReport, extract, renderReport, sinceMs, toJsonl, type Extraction } from "../profile/index.js";

export interface ProfileFlags {
  since?: string;
  repo?: string;
  out?: string;
  json?: boolean;
}

/** Registered project paths, so `evo/apps/ios` attributes to `evo`. Missing registry is fine. */
async function roots(): Promise<string[]> {
  try {
    return (await readRegistry()).projects.map((p) => p.path);
  } catch {
    return [];
  }
}

async function run(flags: ProfileFlags): Promise<Extraction | null> {
  if (sinceMs(flags.since) === null) {
    console.error(`--since must be YYYY-MM-DD, got "${flags.since}".`);
    return null;
  }
  return extract({ since: flags.since, repo: flags.repo, roots: await roots() });
}

function reportIssues(x: Extraction): void {
  if (x.issues.length === 0) return;
  const byMessage = new Map<string, number>();
  for (const i of x.issues) byMessage.set(i.message, (byMessage.get(i.message) ?? 0) + 1);
  console.error(`${x.issues.length} unreadable line(s) or file(s) skipped:`);
  for (const [message, n] of byMessage) console.error(`  ${n} × ${message}`);
}

/** `morpheus profile extract` — JSONL rows to `--out` or stdout. */
export async function profileExtract(flags: ProfileFlags): Promise<number> {
  const x = await run(flags);
  if (!x) return 1;
  const text = toJsonl([...x.sessions, ...x.spans]);
  if (flags.out) {
    await writeFile(flags.out, text, "utf8");
    console.error(`Wrote ${x.sessions.length} sessions and ${x.spans.length} spans from ${x.files} files to ${flags.out}.`);
  } else {
    process.stdout.write(text);
  }
  reportIssues(x);
  return 0;
}

/** `morpheus profile report` — the human summary, or `--json`. */
export async function profileReport(flags: ProfileFlags): Promise<number> {
  const x = await run(flags);
  if (!x) return 1;
  const report = buildReport(x.sessions, x.spans);
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const scope = [flags.since ? `since ${flags.since}` : "all time", flags.repo ? `repo ~ "${flags.repo}"` : null]
      .filter(Boolean)
      .join(", ");
    console.log(renderReport(report, `Agent session profile — ${scope}`));
  }
  reportIssues(x);
  return 0;
}
