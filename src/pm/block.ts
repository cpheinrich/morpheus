import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appendOpenItem } from "../inbox/append.js";
import { updateFrontmatter, today } from "./frontmatter.js";
import { parseArtifact } from "./parse.js";
import { slugify } from "./claim.js";

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
  /** True when the person had no inbox and one was created. */
  inboxCreated: boolean;
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

  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new BlockError(`No roadmap item ${id} in ${productDir}/roadmap/`);
  if (item.data.status === "shipped" || item.data.status === "dropped") {
    throw new BlockError(`${id} is "${item.data.status}" — nothing to block.`);
  }

  const date = today();
  const written: string[] = [];

  const raw = await readFile(item.path, "utf8");
  await writeFile(
    item.path,
    updateFrontmatter(raw, { status: "blocked", needs: needs.trim(), updated: date }),
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

  const inboxPath = join(root, "hq/inbox", `${owner}.md`);
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
        body: inboxBody(opts, item.data.title),
      },
      { owner, date },
    ),
    "utf8",
  );
  written.push(inboxPath);

  return { id, title: item.data.title, written, inboxCreated: existing === null };
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
