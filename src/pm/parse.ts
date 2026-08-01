import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import type { ZodType } from "zod";
import { ARTIFACTS, type ArtifactKind, type ArtifactTypes } from "./schema.js";

/** A parsed item: validated frontmatter plus the markdown body. */
export interface Item<T> {
  /** Absolute path the item was read from. */
  path: string;
  /** Validated frontmatter. */
  data: T;
  /** Markdown body after the frontmatter block. */
  body: string;
}

export interface ParseIssue {
  path: string;
  message: string;
}

export interface ParseResult<T> {
  items: Item<T>[];
  issues: ParseIssue[];
}

/** README.md is generated output, not an item. */
const NOT_AN_ITEM = new Set(["README.md", "readme.md"]);

async function listMarkdown(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".md") && !NOT_AN_ITEM.has(f))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Parse and validate every markdown item in a directory.
 *
 * Invalid files become issues rather than throwing, so a single malformed
 * file cannot block the whole run — `morpheus pm validate` reports all of
 * them at once instead of one per invocation.
 */
export async function parseDir<T>(
  dir: string,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  const items: Item<T>[] = [];
  const issues: ParseIssue[] = [];

  for (const path of await listMarkdown(dir)) {
    const raw = await readFile(path, "utf8");

    // Malformed YAML throws. Catch it so one bad file cannot abort the run —
    // `pm validate` should report every problem at once, not the first.
    let data: unknown;
    let content: string;
    try {
      const parsedFile = matter(raw);
      data = parsedFile.data;
      content = parsedFile.content;
    } catch (err) {
      const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
      issues.push({ path, message: `invalid YAML frontmatter — ${detail}` });
      continue;
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".") || "(root)";
        issues.push({ path, message: `${field}: ${issue.message}` });
      }
      continue;
    }

    // The filename must begin with the id, so a file is findable from its id
    // alone. Roadmap files may then carry a `-slug` (MO-057) which makes the
    // directory readable — `MO-260801-152634-blocked-is-a-first-class-outcome`
    // — without lengthening the id that `prs:` and cross-references repeat.
    const id = (parsed.data as { id?: string }).id;
    const name = basename(path);
    const ok = id ? name === `${id}.md` || name.startsWith(`${id}-`) : true;
    if (id && !ok) {
      issues.push({
        path,
        message: `filename must start with the id — expected ${id}.md or ${id}-<slug>.md`,
      });
      continue;
    }

    items.push({ path, data: parsed.data, body: content.trim() });
  }

  return { items, issues };
}

/** Parse one artifact kind out of a product directory (e.g. hq/product). */
export async function parseArtifact<K extends ArtifactKind>(
  productDir: string,
  kind: K,
): Promise<ParseResult<ArtifactTypes[K]>> {
  const { schema, dir } = ARTIFACTS[kind];
  return parseDir(join(productDir, dir), schema as unknown as ZodType<ArtifactTypes[K]>);
}

/** Detect ids used more than once within a set of items. */
export function findDuplicateIds<T extends { id: string }>(
  items: Item<T>[],
): ParseIssue[] {
  const seen = new Map<string, string>();
  const issues: ParseIssue[] = [];
  for (const item of items) {
    const first = seen.get(item.data.id);
    if (first) {
      issues.push({
        path: item.path,
        message: `duplicate id ${item.data.id} — also defined in ${first}`,
      });
    } else {
      seen.set(item.data.id, item.path);
    }
  }
  return issues;
}
