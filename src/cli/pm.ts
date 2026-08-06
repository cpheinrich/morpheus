import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { INBOX_DIR, TEAM_RESERVED } from "../paths.js";
import { findDuplicateIds, parseArtifact, type ParseIssue } from "../pm/parse.js";
import { block as blockItem, BlockError, unblock as unblockItem } from "../pm/block.js";
import { migrate } from "../pm/migrate-ids.js";
import {
  renderGoals,
  renderRequests,
  renderRoadmap,
  writeIndex,
} from "../pm/index-gen.js";
import { createItem } from "../pm/new-item.js";
import { ageInDays, claim as claimItem, ClaimError, listClaims } from "../pm/claim.js";
import { ARTIFACTS, type ArtifactKind } from "../pm/schema.js";
import { formatReconcile, markShipped, reconcile } from "../pm/ship.js";

const KINDS = Object.keys(ARTIFACTS) as ArtifactKind[];

const exec = promisify(execFile);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whose inbox to write into, when `--owner` was not given.
 *
 * Only answered when there is exactly one inbox. With two people in a repo,
 * guessing puts a blocker in front of the wrong person and it goes unread —
 * refusing and asking costs one flag.
 */
async function inboxOwner(root: string): Promise<string | null> {
  try {
    const files = (await readdir(join(root, INBOX_DIR)))
      .filter((f) => f.endsWith(".md") && !TEAM_RESERVED.has(f.toLowerCase()));
    return files.length === 1 ? basename(files[0]!, ".md") : null;
  } catch {
    return null;
  }
}

/**
 * Commit and push exactly the given paths.
 *
 * Returns false rather than throwing when git is unavailable or the push is
 * rejected: the records are already on disk at that point, and losing them to
 * an exception because the network was down would be the worse outcome. The
 * caller says so out loud instead of reporting a success it did not have.
 */
async function commitRecords(
  root: string,
  paths: string[],
  message: string,
): Promise<boolean> {
  try {
    await exec("git", ["add", "--", ...paths], { cwd: root });
    await exec("git", ["commit", "-m", message], { cwd: root });
    await exec("git", ["push"], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function isKind(v: string): v is ArtifactKind {
  return (KINDS as string[]).includes(v);
}

interface Rendered {
  rendered: string;
  issues: ParseIssue[];
  count: number;
}

/**
 * Parse one kind and render its index table.
 *
 * The switch exists so each branch narrows to a concrete item type — the
 * renderers are type-specific, and a loop with casts would hide a mismatch
 * between a schema and its renderer.
 */
async function renderKind(productDir: string, kind: ArtifactKind): Promise<Rendered> {
  switch (kind) {
    case "roadmap": {
      const { items, issues } = await parseArtifact(productDir, "roadmap");
      return {
        rendered: renderRoadmap(items),
        issues: [...issues, ...findDuplicateIds(items)],
        count: items.length,
      };
    }
    case "goals": {
      const { items, issues } = await parseArtifact(productDir, "goals");
      return {
        rendered: renderGoals(items),
        issues: [...issues, ...findDuplicateIds(items)],
        count: items.length,
      };
    }
    case "requests": {
      const { items, issues } = await parseArtifact(productDir, "requests");
      return {
        rendered: renderRequests(items),
        issues: [...issues, ...findDuplicateIds(items)],
        count: items.length,
      };
    }
  }
}

function report(issues: ParseIssue[]): void {
  for (const issue of issues) {
    console.error(`  ${issue.path}\n    ${issue.message}`);
  }
}

/** Validate every artifact under a product directory. Returns an exit code. */
export async function validate(productDir: string): Promise<number> {
  let total = 0;

  for (const kind of KINDS) {
    const { issues, count } = await renderKind(productDir, kind);
    if (issues.length) {
      console.error(`\n✗ ${ARTIFACTS[kind].label} — ${issues.length} issue(s)`);
      report(issues);
      total += issues.length;
    } else {
      console.log(`✓ ${ARTIFACTS[kind].label} — ${count} item(s)`);
    }
  }

  if (total) {
    console.error(`\n${total} issue(s) found.`);
    return 1;
  }
  console.log("\nAll project management files are valid.");
  return 0;
}

/** Regenerate the README index table for each artifact directory. */
export async function index(productDir: string, check = false): Promise<number> {
  let stale = 0;

  for (const kind of KINDS) {
    const { rendered, issues } = await renderKind(productDir, kind);
    if (issues.length) {
      console.error(`✗ ${ARTIFACTS[kind].label} — fix validation issues first`);
      report(issues);
      return 1;
    }

    const dir = join(productDir, ARTIFACTS[kind].dir);

    // A kind a project does not use has no directory, and `parseDir` already
    // treats that as zero items. Writing an index into it would materialise a
    // directory nobody asked for — and `writeFile` cannot create the parent, so
    // before this the command died with a bare ENOENT.
    //
    // Darwin hit it by moving goals to `hq/strategy/goals/`, which left
    // `hq/product/goals/` absent. That is a legitimate layout: a company has
    // goals that are not product goals.
    if (!(await exists(dir))) {
      console.log(`skipped   ${dir}/README.md — directory not present`);
      continue;
    }

    const changed = await writeIndex(dir, rendered);

    if (changed) {
      stale++;
      console.log(`${check ? "✗ stale  " : "updated  "}${dir}/README.md`);
    } else {
      console.log(`unchanged ${dir}/README.md`);
    }
  }

  if (check && stale) {
    console.error(
      `\n${stale} index file(s) were out of date. Run \`morpheus pm index\` and commit the result.`,
    );
    return 1;
  }
  return 0;
}

/**
 * The project prefix, from morpheus.json beside the product directory.
 *
 * Required rather than defaulted: a wrong prefix silently creates ids that
 * collide with another project, which is worse than refusing.
 */
async function projectPrefix(productDir: string): Promise<string | null> {
  // hq/product -> hq -> repo root
  const root = dirname(dirname(productDir));
  try {
    const raw = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as {
      prefix?: string;
    };
    return raw.prefix ?? null;
  } catch {
    return null;
  }
}

/** Create a new item and print its path. */
export async function create(
  productDir: string,
  kind: string,
  title: string,
  opts: { priority?: string; goal?: string; slug?: string },
  cwd: string,
): Promise<number> {
  if (!isKind(kind)) {
    console.error(`Unknown kind "${kind}". Expected one of: ${KINDS.join(", ")}`);
    return 1;
  }
  if (!title) {
    console.error("A title is required.");
    return 1;
  }

  const prefix = await projectPrefix(productDir);
  if (!prefix) {
    console.error(
      'No "prefix" in morpheus.json. Add a 2-4 letter uppercase prefix — it namespaces\n' +
        "every id in this repo so they cannot collide with another project.",
    );
    return 1;
  }

  const { path, id, blind } = await createItem({ productDir, kind, prefix, title, cwd, ...opts });
  console.log(`Created ${path}`);
  if (blind) {
    console.warn(
      `\x1b[33mCould not reach origin, so ${id} was allocated from local files alone.\x1b[0m\n` +
        `\x1b[2mAnother session may already hold it on a branch. Run \`morpheus pm claims\`\n` +
        `once you have a connection — \`pm claim\` will refuse the id if it is taken.\x1b[0m`,
    );
  }
  return index(productDir);
}

/** Claim a roadmap item by staking its branch on the remote. */
export async function claim(productDir: string, id: string, cwd: string): Promise<number> {
  if (!id) {
    console.error("Usage: morpheus pm claim RM-014");
    return 1;
  }
  try {
    const r = await claimItem(productDir, id.toUpperCase(), cwd);
    console.log(`Claimed ${r.id} — ${r.title}`);
    console.log(`Branch ${r.branch} pushed; status set to in-progress.`);
    if (r.shipped?.length) {
      console.log(
        `\x1b[2mAlso marked shipped, riding along in this branch: ${r.shipped.join(", ")}\x1b[0m`,
      );
    }
    return 0;
  } catch (err) {
    if (err instanceof ClaimError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

/**
 * List live claims, oldest activity flagged as possibly stale.
 *
 * Blocked claims are labelled rather than hidden. They hold a branch on
 * purpose — the partial work is on it — but reading them as active work is
 * exactly backwards: nothing moves them without an answer, and a claim that has
 * been sitting for nine days looks abandoned when it is in fact waiting.
 */
export async function claims(
  productDir: string,
  cwd: string,
  staleDays = 7,
): Promise<number> {
  const all = await listClaims(cwd);
  if (all.length === 0) {
    console.log("No items are currently claimed.");
    return 0;
  }

  const { items } = await parseArtifact(productDir, "roadmap");
  const blocked = new Map(
    items.filter((i) => i.data.status === "blocked").map((i) => [i.data.id, i.data.needs]),
  );

  // Sized from the data, not a constant. The widths were picked for `MO-045`
  // and a timestamp id is twenty characters, so every row after the first long
  // one lost its columns.
  const idWidth = Math.max(8, ...all.map((c) => c.id.length));
  const branchWidth = Math.min(48, Math.max(...all.map((c) => c.branch.length)));

  const now = new Date();
  for (const c of all) {
    const age = c.at ? ageInDays(c.at, now) : undefined;
    // A blocked claim is never stale — the clock is on the reader, not the agent.
    const isBlocked = blocked.has(c.id);
    const stale = !isBlocked && age !== undefined && age >= staleDays;
    const when = age === undefined ? "" : age === 0 ? "today" : `${age}d ago`;
    console.log(
      `${stale ? "!" : isBlocked ? "⊘" : " "} ${c.id.padEnd(idWidth)} ${c.branch.padEnd(branchWidth)} ${(c.by ?? "").padEnd(18)} ${when}`,
    );
    if (isBlocked) {
      console.log(`  \x1b[2mblocked — needs: ${blocked.get(c.id) ?? "(unrecorded)"}\x1b[0m`);
    }
  }

  const staleCount = all.filter(
    (c) => !blocked.has(c.id) && c.at && ageInDays(c.at, now) >= staleDays,
  ).length;
  if (staleCount) {
    console.log(`\n${staleCount} claim(s) with no activity for ${staleDays}+ days (marked !).`);
  }
  if (blocked.size) {
    console.log(`${blocked.size} blocked (⊘) — waiting on an answer, not on an agent.`);
  }

  // An offline `pm block` writes its records and skips the push, and its only
  // other trace is a yellow line that has already scrolled past. A block
  // nobody can see is not a block, so the state has to be visible somewhere
  // that gets read again — this is the "what is in flight" view, and it
  // already has the board in hand.
  const uncommitted = await uncommittedBlockRecords(cwd, [...blocked.keys()]);
  if (uncommitted.length) {
    console.log(
      `\n\x1b[33m${uncommitted.length} blocked item(s) have uncommitted records — the escalation is\n` +
        `on this machine only. Commit and push so it reaches whoever answers:\x1b[0m`,
    );
    for (const p of uncommitted) console.log(`  ${p}`);
  }
  return 0;
}

/**
 * Records belonging to blocked items that are still only in the working tree.
 *
 * Matched by id rather than by path shape, so an unrelated dirty file is not
 * reported as a dropped escalation.
 */
async function uncommittedBlockRecords(cwd: string, blockedIds: string[]): Promise<string[]> {
  if (!blockedIds.length) return [];
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["status", "--porcelain"], {
      cwd,
      timeout: 10_000,
    });
    const dirty = stdout
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    return dirty.filter((path) => blockedIds.some((id) => path.includes(id)));
  } catch {
    return [];
  }
}

/**
 * Mark an item blocked, and commit the three records it writes.
 *
 * The git half lives here rather than in `pm/block.ts` so the writes stay
 * testable without a repository. Only the files it wrote are staged: `add -A`
 * would sweep whatever else is in the tree into a commit nobody intended, which
 * is the same reason `claim` stages explicitly.
 */
export interface BlockOutcome {
  code: number;
  /**
   * Repo-relative paths this call wrote, empty on every failure path. The
   * caller re-fingerprints these into its context receipt, and passing
   * anything it did not write would have the receipt assert a record was read
   * that this session neither read nor wrote.
   */
  written: string[];
}

export async function block(
  productDir: string,
  root: string,
  id: string,
  opts: { needs?: string; owner?: string; context?: string; push?: boolean },
): Promise<BlockOutcome> {
  const nothing = (code: number): BlockOutcome => ({ code, written: [] });

  if (!id) {
    console.error('Usage: morpheus pm block MO-051 --needs "what would unblock this"');
    return nothing(1);
  }
  if (!opts.needs?.trim()) {
    console.error(
      'A --needs is required: morpheus pm block MO-051 --needs "which model, and whose\n' +
        'subscription pays for it".\n\n' +
        '"Blocked on Chris" is not a need — say what would actually unblock it.',
    );
    return nothing(1);
  }

  const owner = opts.owner ?? (await inboxOwner(root));
  if (!owner) {
    console.error(
      "Could not tell whose inbox this belongs in. Pass --owner <github-handle>, or add\n" +
        "one inbox under hq/team/ so there is an unambiguous default.",
    );
    return nothing(1);
  }

  try {
    const r = await blockItem({
      productDir,
      root,
      id: id.toUpperCase(),
      needs: opts.needs,
      owner,
      ...(opts.context ? { context: opts.context } : {}),
    });

    console.log(`\x1b[33m${r.id} → blocked\x1b[0m — ${r.title}`);
    console.log(`Needs: ${opts.needs.trim()}`);
    for (const p of r.written) console.log(`  wrote ${p}`);
    if (r.inboxCreated) console.log(`  (created a new inbox for ${owner})`);

    if (opts.push === false) {
      // Offline. The records are written, which is what keeps `pm block`
      // reachable when a session most needs it — but a block nobody can see
      // is not yet a block, and saying so is the difference between a
      // deferred step and a silently dropped one.
      console.log(
        "\x1b[33mOffline: written to disk and not pushed. The block is not visible to other\n" +
          "sessions yet — commit and push it when you reconnect.\x1b[0m",
      );
    } else {
      const pushed = await commitRecords(
        root,
        r.written,
        `chore(${r.id}): blocked — ${opts.needs.trim().slice(0, 60)}`,
      );
      console.log(
        pushed
          ? "Committed and pushed — the block is visible to every other session."
          : "\x1b[33mCommitted nothing: not a git repo, or the push failed. The records are on disk.\x1b[0m",
      );
    }

    console.log(
      `\nThe branch stays claimed. When answered: \`morpheus pm unblock ${r.id}\`.`,
    );
    return { code: 0, written: r.written };
  } catch (err) {
    if (err instanceof BlockError) {
      console.error(err.message);
      return nothing(1);
    }
    throw err;
  }
}

/** Return a blocked item to in-progress. */
export async function unblock(productDir: string, id: string): Promise<number> {
  if (!id) {
    console.error("Usage: morpheus pm unblock MO-051");
    return 1;
  }
  try {
    const r = await unblockItem(productDir, id.toUpperCase());
    console.log(`\x1b[32m${r.id} → in-progress\x1b[0m — ${r.title}`);
    console.log(
      "The inbox item is left alone: close it in the next cycle, where the answer is recorded.",
    );
    return 0;
  } catch (err) {
    if (err instanceof BlockError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

/**
 * Move merged items to shipped.
 *
 * With no id, reconciles every `review` item against merged pull requests.
 * With ids, marks those directly — the escape hatch for work that shipped
 * without a PR this tool can see.
 */
export async function ship(
  productDir: string,
  ids: string[],
  cwd: string,
  check = false,
): Promise<number> {
  if (ids.length) {
    for (const id of ids) {
      await markShipped(productDir, id);
      console.log(`\x1b[32m${id} → shipped\x1b[0m`);
    }
    return 0;
  }

  const result = await reconcile(productDir, cwd, { write: !check });
  console.log(formatReconcile(result));

  // `--check` is for CI, where a roadmap that disagrees with merged PRs is a
  // failure. Without it, finding nothing to do is a success.
  if (check) return result.outcomes.some((o) => o.kind === "shipped") ? 1 : 0;
  return 0;
}

/**
 * Migrate integer roadmap ids to the dated scheme (MO-057).
 *
 * `--check` plans and reports without writing, which is how a repo confirms it
 * is already migrated. The order check runs in both modes and refuses rather
 * than warns: a board whose order silently changed is worse than one that was
 * not migrated.
 */
export async function migrateIds(
  productDir: string,
  dryRun: boolean,
  repoRoot: string = process.cwd(),
): Promise<number> {
  const roadmapDir = join(productDir, "roadmap");

  let result;
  try {
    result = await migrate(roadmapDir, dryRun, join(repoRoot, ".agent", "worklog"), [
      join(repoRoot, "hq"),
      join(repoRoot, ".agent"),
    ]);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  for (const p of result.problems) console.error(`✗ ${p}`);

  if (result.renames.length === 0) {
    console.log(`Nothing to migrate — ${result.skipped.length} item(s) already dated.`);
    return result.problems.length ? 1 : 0;
  }

  console.log(`${dryRun ? "Would migrate" : "Migrated"} ${result.renames.length} item(s):\n`);
  for (const r of result.renames) console.log(`  ${r.oldId.padEnd(10)} → ${r.newId}`);
  if (result.skipped.length) console.log(`\n${result.skipped.length} already dated, left alone.`);
  console.log("\nOrdering verified unchanged.");

  if (result.referencesUpdated.length) {
    console.log(`\n${result.referencesUpdated.length} worklog reference(s) repointed.`);
  }
  if (result.linksUpdated.length) {
    console.log(`${result.linksUpdated.length} file(s) had markdown links repaired.`);
  }
  if (!dryRun) console.log("Run `morpheus pm index` to regenerate the tables.");
  return result.problems.length ? 1 : 0;
}
