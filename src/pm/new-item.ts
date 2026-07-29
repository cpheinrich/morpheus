import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { claimedNumbers } from "./claim.js";
import { parseArtifact } from "./parse.js";
import { ARTIFACTS, type ArtifactKind } from "./schema.js";

/** Infix per artifact kind. Roadmap items get the bare project prefix. */
const INFIX: Record<ArtifactKind, string> = {
  roadmap: "",
  goals: "G-",
  requests: "FR-",
};

export interface Allocation {
  id: string;
  /**
   * True when the remote could not be consulted, so the id is derived from
   * local files alone and may already be claimed elsewhere.
   */
  blind: boolean;
}

/**
 * Allocate the next sequential id for an artifact kind.
 *
 * Two sources, because neither alone is complete: the item files hold every id
 * that has **merged**, and the remote branch heads hold every id another
 * session has **claimed** but not yet landed. Reading only the first re-issues
 * a live claim.
 *
 * `blind` is returned rather than swallowed. An unreachable origin cannot tell
 * us an id is free, and reporting that as a clean allocation is the mistake
 * `.agent/learned.md` records under *never let an unanswerable question render
 * as a confident answer*.
 */
export async function nextId(
  productDir: string,
  kind: ArtifactKind,
  prefix: string,
  cwd: string,
): Promise<Allocation> {
  const { items } = await parseArtifact(productDir, kind);
  const local = items
    .map((i) => /(\d+)$/.exec((i.data as { id: string }).id)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);

  const idPrefix = `${prefix}-${INFIX[kind]}`;
  const claimed = await claimedNumbers(idPrefix, cwd);

  const nums = [...local, ...(claimed ?? [])];
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return { id: `${idPrefix}${String(next).padStart(3, "0")}`, blind: claimed === null };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Render a YAML scalar, quoting when the value would otherwise be misparsed.
 *
 * Titles routinely contain colons ("PM package: schemas, parser"), which YAML
 * reads as a nested mapping and rejects. Quoting defensively is cheaper than
 * expecting whoever writes a title to know YAML.
 */
function scalar(value: unknown): string {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  const s = String(value);
  if (/^[\w.\-/]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontmatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${scalar(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export interface NewItemOptions {
  productDir: string;
  kind: ArtifactKind;
  /** Project prefix from morpheus.json. */
  prefix: string;
  title: string;
  /** Repo root, so allocation can ask origin which ids are already claimed. */
  cwd: string;
  /** Roadmap only. */
  priority?: string;
  goal?: string;
}

export interface NewItem {
  path: string;
  id: string;
  /** True when origin could not be consulted and the id may collide. */
  blind: boolean;
}

/** Create a new item file with valid frontmatter. */
export async function createItem(opts: NewItemOptions): Promise<NewItem> {
  const { productDir, kind, prefix, title, cwd } = opts;
  const dir = join(productDir, ARTIFACTS[kind].dir);
  await mkdir(dir, { recursive: true });

  const { id, blind } = await nextId(productDir, kind, prefix, cwd);
  const date = today();

  let fm: string;
  let body: string;

  switch (kind) {
    case "roadmap":
      fm = frontmatter({
        id,
        title,
        status: "backlog",
        priority: opts.priority ?? "P2",
        goal: opts.goal,
        owner: "agent",
        prs: [],
        created: date,
        updated: date,
      });
      body = "## Context\n\n_Why this matters._\n\n## Approach\n\n_How it will be done._\n";
      break;
    case "goals":
      fm = frontmatter({
        id,
        title,
        horizon: "quarterly",
        period: `${date.slice(0, 4)}-Q1`,
        metric: "TBD",
        target: "TBD",
        status: "on-track",
      });
      body = "## Why this goal\n\n_What it unlocks._\n";
      break;
    case "requests":
      fm = frontmatter({
        id,
        title,
        source: "founder",
        status: "new",
        created: date,
      });
      body = "## Request\n\n_What was asked for, in the requester's words._\n";
      break;
  }

  const path = join(dir, `${id}.md`);
  await writeFile(path, `${fm}\n${body}`, "utf8");
  return { path, id, blind };
}
