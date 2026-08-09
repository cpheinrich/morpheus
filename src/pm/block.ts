import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import matter from "gray-matter";
import { appendOpenItem } from "../inbox/append.js";
import { updateFrontmatter, today } from "./frontmatter.js";
import { INBOX_DIR } from "../paths.js";
import { parseArtifact } from "./parse.js";
import { slugify } from "./claim.js";
import { renderRoadmap, writeIndex } from "./index-gen.js";
import { RoadmapItem, type RoadmapItem as RoadmapItemData } from "./schema.js";

/**
 * Blocking an item: the third exit.
 *
 * An agent that can only finish or fail will, on meeting real ambiguity, take
 * the worse of the two — it guesses, and ships something plausible. Escalating
 * is cheap and shipping half-baked is expensive, and that asymmetry has to be
 * structural, because advice loses to momentum.
 *
 * Three records, because each answers a different question later: the **item**
 * says the work is stopped and why (read by the board and the heartbeat), the
 * **worklog** says what was attempted before stopping (read by a human picking
 * it up), and the **inbox** puts the question in front of the person who can
 * answer it. Writing only the first is how a blocker becomes invisible.
 *
 * Git is deliberately not done here. `claim` commits because the branch *is*
 * the claim; for blocking, version control is incidental, and keeping it out
 * makes this testable against a temp directory rather than a repo.
 */

export class BlockError extends Error {}

export interface BlockOptions {
  productDir: string;
  /** Repo root — worklog and inbox are resolved from it. */
  root: string;
  id: string;
  /** What would actually unblock this. */
  needs: string;
  /** Inbox owner, by GitHub handle. */
  owner: string;
  agent?: "claude" | "codex" | "human";
  /** Free prose: what was attempted before stopping. */
  context?: string;
}

export interface BlockResult {
  id: string;
  title: string;
  /** Files written, repo-relative-ish absolute paths, in write order. */
  written: string[];
  /**
   * The inbox as it was **immediately before** this call appended to it, or
   * null if it did not exist. The caller re-fingerprints the record into its
   * context receipt, and may only do so when this still matches what the
   * receipt asserts — otherwise a reply that landed inside the term would be
   * absorbed and the evidence of it lost.
   */
  inboxBefore: string | null;
  /** True when the person had no inbox and one was created. */
  inboxCreated: boolean;
  /** Explicit because generated files may be appended after it in `written`. */
  inboxPath: string;
  /** True when this call repaired or replaced a block that already existed. */
  alreadyBlocked: boolean;
  /** Validation problems that prevented a safe index refresh. */
  indexIssues: string[];
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function worklogBody(opts: BlockOptions, title: string, date: string): string {
  return [
    "---",
    `date: ${date}`,
    `agent: ${opts.agent ?? "claude"}`,
    `roadmap: ${opts.id}`,
    "outcome: blocked",
    `summary: ${JSON.stringify(`Stopped on ambiguity — needs: ${opts.needs}`)}`,
    "---",
    "",
    `# ${opts.id} — ${title}`,
    "",
    `${date}, \`${opts.agent ?? "claude"}\`. **Blocked.**`,
    "",
    "## What it needs",
    "",
    opts.needs,
    "",
    "## Where it stopped",
    "",
    opts.context?.trim() ||
      "_Not recorded. The next session should read the branch before continuing._",
    "",
  ].join("\n");
}

function inboxBody(opts: BlockOptions, title: string): string {
  return [
    `**${opts.id} — ${title}** is stopped and holding its branch.`,
    "",
    "**What I need:**",
    "",
    opts.needs,
    ...(opts.context?.trim() ? ["", "**Where it stopped:**", "", opts.context.trim()] : []),
    "",
    "I stopped rather than guessing — a plausible guess here costs more to find later than this",
    "question costs to answer.",
  ].join("\n");
}

interface BlockTarget {
  path: string;
  data: RoadmapItemData;
  raw: string;
  alreadyBlocked: boolean;
}

/**
 * Find the item even in the one invalid state `pm block` is meant to repair:
 * `status: blocked` written by hand without the schema-required `needs:`.
 */
async function blockTarget(
  productDir: string,
  id: string,
  needs: string,
): Promise<BlockTarget> {
  const parsed = await parseArtifact(productDir, "roadmap");
  const item = parsed.items.find((candidate) => candidate.data.id === id);
  if (item) {
    return {
      path: item.path,
      data: item.data,
      raw: await readFile(item.path, "utf8"),
      alreadyBlocked: item.data.status === "blocked",
    };
  }

  const candidatePaths = [
    ...new Set(
      parsed.issues
        .map((issue) => issue.path)
        .filter((path) => {
          const name = basename(path);
          return name === `${id}.md` || name.startsWith(`${id}-`);
        }),
    ),
  ];

  for (const path of candidatePaths) {
    const raw = await readFile(path, "utf8");
    let data: Record<string, unknown>;
    try {
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }
    if (data["id"] !== id || data["status"] !== "blocked") continue;

    const repaired = RoadmapItem.safeParse({ ...data, needs: needs.trim() });
    if (repaired.success) {
      return { path, data: repaired.data, raw, alreadyBlocked: true };
    }
  }

  if (candidatePaths.length) {
    const detail = parsed.issues
      .filter((issue) => candidatePaths.includes(issue.path))
      .map((issue) => issue.message)
      .join("; ");
    throw new BlockError(`${id} exists but is invalid — ${detail}`);
  }
  throw new BlockError(`No roadmap item ${id} in ${productDir}/roadmap/`);
}

/**
 * Mark an item blocked and route the question to its owner.
 *
 * The claim is deliberately **not** released. The partial work lives on that
 * branch, so re-taking the item means checking it out rather than starting
 * again — but a blocked claim holds no lane in the heartbeat's ceiling, or one
 * unanswered question would consume a slot forever.
 */
export async function block(opts: BlockOptions): Promise<BlockResult> {
  const { productDir, root, id, needs, owner } = opts;

  if (!needs.trim()) {
    throw new BlockError(
      `--needs is required, and "blocked on Chris" is not a need. Say what would ` +
        `actually unblock this — a decision, a credential, an answer to a question.`,
    );
  }

  const item = await blockTarget(productDir, id, needs);
  if (item.data.status === "shipped" || item.data.status === "dropped") {
    throw new BlockError(`${id} is "${item.data.status}" — nothing to block.`);
  }

  const date = today();
  const written: string[] = [];

  await writeFile(
    item.path,
    updateFrontmatter(item.raw, { status: "blocked", needs: needs.trim(), updated: date }),
    "utf8",
  );
  written.push(item.path);

  const worklogPath = join(
    root,
    ".agent/worklog",
    `${date}-${id.toLowerCase()}-blocked-${slugify(needs)}.md`,
  );
  await mkdir(dirname(worklogPath), { recursive: true });
  await writeFile(worklogPath, worklogBody(opts, item.data.title, date), "utf8");
  written.push(worklogPath);

  const inboxPath = join(root, INBOX_DIR, `${owner}.md`);
  const existing = await readIfExists(inboxPath);
  await mkdir(dirname(inboxPath), { recursive: true });
  await writeFile(
    inboxPath,
    appendOpenItem(
      existing,
      {
        title: `Blocked: ${item.data.title}`,
        agent: opts.agent ?? "claude",
        roadmap: id,
        roadmapFile: basename(item.path),
        body: inboxBody(opts, item.data.title),
      },
      { owner, date },
    ),
    "utf8",
  );
  written.push(inboxPath);

  // The index is generated state, but `pm block` commits its own records. If
  // it does not refresh the table before that commit, the next unrelated PR
  // fails `pm index --check` for a status change this command made.
  const refreshed = await parseArtifact(productDir, "roadmap");
  const indexIssues = refreshed.issues.map((issue) => `${issue.path}: ${issue.message}`);
  if (!indexIssues.length) {
    const indexPath = join(productDir, "roadmap", "README.md");
    if (await writeIndex(join(productDir, "roadmap"), renderRoadmap(refreshed.items))) {
      written.push(indexPath);
    }
  }

  return {
    id,
    title: item.data.title,
    written,
    inboxBefore: existing,
    inboxCreated: existing === null,
    inboxPath,
    alreadyBlocked: item.alreadyBlocked,
    indexIssues,
  };
}

export interface UnblockResult {
  id: string;
  title: string;
  path: string;
}

/**
 * Return a blocked item to `in-progress` and clear its `needs`.
 *
 * `needs` is removed rather than kept for history — a stale need reads as
 * current, which is worse than never having written one. The worklog entry is
 * the history, and it stays.
 */
export async function unblock(
  productDir: string,
  id: string,
): Promise<UnblockResult> {
  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new BlockError(`No roadmap item ${id} in ${productDir}/roadmap/`);
  if (item.data.status !== "blocked") {
    throw new BlockError(`${id} is "${item.data.status}", not blocked.`);
  }

  const raw = await readFile(item.path, "utf8");
  await writeFile(
    item.path,
    updateFrontmatter(raw, { status: "in-progress", needs: null, updated: today() }),
    "utf8",
  );
  return { id, title: item.data.title, path: item.path };
}
