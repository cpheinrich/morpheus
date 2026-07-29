import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Item } from "./parse.js";
import type { Goal, Priority, Request, RoadmapItem, RoadmapStatus } from "./schema.js";

export const BEGIN = "<!-- morpheus:begin -->";
export const END = "<!-- morpheus:end -->";

const STATUS_ORDER: Record<RoadmapStatus, number> = {
  "in-progress": 0,
  review: 1,
  backlog: 2,
  shipped: 3,
  dropped: 4,
};

const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function cell(value: string | undefined): string {
  return value && value.length > 0 ? value.replace(/\|/g, "\\|") : "—";
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_Nothing here yet._";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

/** Link an item id to its own file, so the table is navigable on GitHub. */
function link(id: string): string {
  return `[${id}](./${id}.md)`;
}

export function renderRoadmap(items: Item<RoadmapItem>[]): string {
  const sorted = [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.data.status] - STATUS_ORDER[b.data.status] ||
      PRIORITY_ORDER[a.data.priority] - PRIORITY_ORDER[b.data.priority] ||
      a.data.id.localeCompare(b.data.id),
  );
  return table(
    ["ID", "Title", "Status", "Pri", "Goal", "PRs"],
    sorted.map((i) => [
      link(i.data.id),
      cell(i.data.title),
      i.data.status,
      i.data.priority,
      cell(i.data.goal),
      i.data.prs.length ? i.data.prs.map((n) => `#${n}`).join(", ") : "—",
    ]),
  );
}

export function renderGoals(items: Item<Goal>[]): string {
  const sorted = [...items].sort((a, b) => a.data.id.localeCompare(b.data.id));
  return table(
    ["ID", "Title", "Period", "Metric", "Target", "Current", "Status"],
    sorted.map((i) => [
      link(i.data.id),
      cell(i.data.title),
      cell(i.data.period),
      cell(i.data.metric),
      cell(i.data.target),
      cell(i.data.current),
      i.data.status,
    ]),
  );
}

export function renderRequests(items: Item<Request>[]): string {
  const sorted = [...items].sort((a, b) => a.data.id.localeCompare(b.data.id));
  return table(
    ["ID", "Title", "Source", "Status", "Roadmap"],
    sorted.map((i) => [
      link(i.data.id),
      cell(i.data.title),
      i.data.source,
      i.data.status,
      cell(i.data.roadmap),
    ]),
  );
}

/**
 * Splice a generated table into a README, preserving anything outside the
 * markers. A README with no markers is created fresh; hand-written prose
 * above or below the block survives regeneration.
 */
export function spliceIndex(existing: string | null, generated: string): string {
  const block = `${BEGIN}\n${generated}\n${END}`;

  if (existing) {
    const start = existing.indexOf(BEGIN);
    const end = existing.indexOf(END);
    if (start !== -1 && end !== -1 && end > start) {
      return existing.slice(0, start) + block + existing.slice(end + END.length);
    }
    // Markers missing — append rather than clobbering existing prose.
    return `${existing.trimEnd()}\n\n${block}\n`;
  }

  return `${block}\n`;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write the generated table into `<dir>/README.md`. Returns true if changed. */
export async function writeIndex(dir: string, generated: string): Promise<boolean> {
  const path = join(dir, "README.md");
  const existing = await readIfExists(path);
  const next = spliceIndex(existing, generated);
  if (existing === next) return false;
  await writeFile(path, next, "utf8");
  return true;
}
