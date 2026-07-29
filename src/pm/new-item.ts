import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArtifact } from "./parse.js";
import { ARTIFACTS, type ArtifactKind } from "./schema.js";

const PREFIX: Record<ArtifactKind, string> = {
  roadmap: "RM",
  goals: "G",
  requests: "FR",
};

/**
 * Allocate the next sequential id for an artifact kind.
 *
 * Concurrent agents can in principle pick the same number; `pm validate`
 * catches duplicates in CI, which is cheaper than coordinating allocation.
 */
export async function nextId(productDir: string, kind: ArtifactKind): Promise<string> {
  const { items } = await parseArtifact(productDir, kind);
  const nums = items
    .map((i) => /(\d+)$/.exec((i.data as { id: string }).id)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${PREFIX[kind]}-${String(next).padStart(3, "0")}`;
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
  title: string;
  /** Roadmap only. */
  priority?: string;
  goal?: string;
}

/** Create a new item file with valid frontmatter. Returns its path. */
export async function createItem(opts: NewItemOptions): Promise<string> {
  const { productDir, kind, title } = opts;
  const dir = join(productDir, ARTIFACTS[kind].dir);
  await mkdir(dir, { recursive: true });

  const id = await nextId(productDir, kind);
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
  return path;
}
