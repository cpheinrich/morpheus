import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { claimedNumbers } from "./claim.js";
import { itemFilename, periodInZone, timestampId } from "./id.js";
import { today } from "./frontmatter.js";
import { parseArtifact } from "./parse.js";
import { ARTIFACTS, type ArtifactKind } from "./schema.js";
import { headSha } from "./git-sha.js";

/** Infix per artifact kind. Roadmap items get the bare project prefix. */
const INFIX: Record<ArtifactKind, string> = {
  roadmap: "",
  goals: "G-",
  requests: "FR-",
};

/**
 * Digits in the sequence number, per kind.
 *
 * Two for goals, because `GOAL_ID` in `schema.ts` spells the shape out as
 * `\d{2}` and the sequence restarts every quarter, so three would be padding
 * for a hundred goals nobody sets in ninety days.
 */
const SEQ_DIGITS: Record<ArtifactKind, number> = {
  roadmap: 0, // unused — roadmap ids come from the clock
  goals: 2,
  requests: 3,
};

/**
 * The id prefix a sequence number is allocated under.
 *
 * Goals scope theirs to the period, so the leading run of a new quarter starts
 * at `01` again and the id says which quarter it belongs to without opening
 * the file.
 */
function sequencePrefix(kind: ArtifactKind, prefix: string, now: Date): string {
  const base = `${prefix}-${INFIX[kind]}`;
  return kind === "goals" ? `${base}${periodInZone(now)}-` : base;
}

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
  now: Date = new Date(),
): Promise<Allocation> {
  const { items } = await parseArtifact(productDir, kind);

  // Roadmap ids come from the clock (MO-057). No remote is consulted because
  // none can help: a fork contributor's `origin` is their fork, so there is no
  // query that would tell them which ids Morpheus has issued. Allocation that
  // needs no answer cannot be given a wrong one — so `blind` is false here, not
  // suppressed.
  if (kind === "roadmap") {
    const taken = items.map((i) => (i.data as { id: string }).id);
    return { id: timestampId(prefix, taken, now), blind: false };
  }

  // Goals and requests keep sequential ids: they are rare, written
  // deliberately, and have never collided.
  //
  // Matching on the full id prefix rather than "trailing digits of anything in
  // this directory" is what makes the goal sequence per-period. Sliced the
  // loose way, Q2's `-07` would push the first Q3 goal to `-08` and leave a
  // gap that reads as a deleted goal.
  const idPrefix = sequencePrefix(kind, prefix, now);
  const local = items
    .map((i) => (i.data as { id: string }).id)
    .filter((id) => id.startsWith(idPrefix))
    .map((id) => /(\d+)$/.exec(id)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);

  const claimed = await claimedNumbers(idPrefix, cwd);

  const nums = [...local, ...(claimed ?? [])];
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return {
    id: `${idPrefix}${String(next).padStart(SEQ_DIGITS[kind], "0")}`,
    blind: claimed === null,
  };
}

// One definition, in `frontmatter.ts`, resolving to the ids' fixed zone. Three
// local copies had drifted to UTC, so `created:` could read a day ahead of the
// id written beside it in the same call.


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
  /** Name the slug deliberately, like a branch. Falls back to the title. */
  slug?: string;
  goal?: string;
  /** Injectable clock, so tests can pin the period a goal lands in. */
  now?: Date;
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

  // One clock for the id and every date derived beside it. A goal id contains
  // its period, so reading the time twice is enough to write a Q3 id into a
  // file that calls itself Q4.
  const now = opts.now ?? new Date();
  const { id, blind } = await nextId(productDir, kind, prefix, cwd, now);
  const date = today(now);

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
        // What the repo looked like when this was written. Absent rather than
        // empty when git cannot say — see git-sha.ts.
        baseSha: (await headSha(cwd)) ?? undefined,
      });
      body = "## Context\n\n_Why this matters._\n\n## Approach\n\n_How it will be done._\n";
      break;
    case "goals":
      fm = frontmatter({
        id,
        title,
        horizon: "quarterly",
        // The same value the id carries — see `periodInZone`.
        period: periodInZone(now),
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

  // Roadmap filenames carry a slug so the directory is readable; the id stays
  // out of it short, since that is what `prs:`, `goal:` and cross-references
  // repeat. Goals and requests keep `<id>.md` — there are few of them and their
  // ids already read as words.
  const name = kind === "roadmap" ? itemFilename(id, title, undefined, opts.slug) : `${id}.md`;
  const path = join(dir, name);

  // `wx` — never overwrite.
  //
  // Allocation reads `parseArtifact(...).items`, which *excludes* anything that
  // failed to parse. So a goal file that exists but is malformed — the
  // canonical case being an unquoted colon in a title, the first entry under
  // *things that have bitten us* — is invisible here, its id is re-issued, and
  // an unconditional write replaces someone's work with the TBD template while
  // printing `Created` and exiting 0.
  //
  // Raising the sequence past ids we cannot read would mean parsing filenames
  // rather than frontmatter, which is more machinery than the case is worth.
  // Refusing costs one flag and turns silent data loss into a message naming
  // the file.
  try {
    await writeFile(path, `${fm}\n${body}`, { encoding: "utf8", flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error(
      `${path} already exists, so ${id} was not written.\n` +
        `That id looked free because the file could not be parsed. ` +
        `Run \`morpheus pm validate\` to see what is wrong with it.`,
    );
  }

  return { path, id, blind };
}
