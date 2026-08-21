import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Item } from "./parse.js";
import type { Goal, Request } from "./schema.js";

export const BEGIN = "<!-- morpheus:begin -->";
export const END = "<!-- morpheus:end -->";

export const STATIC_ROADMAP_README = `# Roadmap

One Markdown file per item. Item frontmatter is canonical: agents, Morpheus
commands, and the \`/hq\` roadmap view parse those files directly.

This README is deliberately static. Do not add a generated task table here:
concurrent status changes would all rewrite this one file and create avoidable
merge conflicts.
`;

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

/**
 * Link to the file, not to `<id>.md`.
 *
 * Filenames stopped equalling ids in MO-057, when roadmap items gained a slug —
 * `MO-26-07-28-005-kit-hq-dashboard-shell.md`. The generated index kept
 * assembling `./${id}.md` and produced 77 broken links across three tables,
 * caught only because darwin has a test asserting relative links resolve.
 *
 * The item already carries the path it was read from, so this needs no new
 * information — only to stop reconstructing what it was given.
 */
function link(id: string, path: string): string {
  return `[${id}](./${basename(path)})`;
}

export function renderGoals(items: Item<Goal>[]): string {
  const sorted = [...items].sort((a, b) => a.data.id.localeCompare(b.data.id));
  return table(
    ["ID", "Title", "Period", "Metric", "Target", "Current", "Status"],
    sorted.map((i) => [
      link(i.data.id, i.path),
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
      link(i.data.id, i.path),
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

/**
 * Retire the old generated roadmap table once, without overwriting a README
 * that is already hand-maintained. Future calls are no-ops.
 */
export async function writeStaticRoadmapReadme(
  dir: string,
  checkOnly = false,
): Promise<boolean> {
  const path = join(dir, "README.md");
  const existing = await readIfExists(path);

  if (existing !== null && !existing.includes(BEGIN) && !existing.includes(END)) return false;
  if (existing === STATIC_ROADMAP_README) return false;

  if (!checkOnly) await writeFile(path, STATIC_ROADMAP_README, "utf8");
  return true;
}

/** Write the generated table into `<dir>/README.md`. Returns true if changed. */
export async function writeIndex(
  dir: string,
  generated: string,
  checkOnly = false,
): Promise<boolean> {
  const path = join(dir, "README.md");
  const existing = await readIfExists(path);
  const next = spliceIndex(existing, generated);
  if (existing === next) return false;
  if (!checkOnly) await writeFile(path, next, "utf8");
  return true;
}
