import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { findDuplicateIds, parseArtifact, type ParseIssue } from "../pm/parse.js";
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
  opts: { priority?: string; goal?: string },
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

/** List live claims, oldest activity flagged as possibly stale. */
export async function claims(cwd: string, staleDays = 7): Promise<number> {
  const all = await listClaims(cwd);
  if (all.length === 0) {
    console.log("No items are currently claimed.");
    return 0;
  }

  const now = new Date();
  for (const c of all) {
    const age = c.at ? ageInDays(c.at, now) : undefined;
    const stale = age !== undefined && age >= staleDays;
    const when = age === undefined ? "" : age === 0 ? "today" : `${age}d ago`;
    console.log(
      `${stale ? "!" : " "} ${c.id.padEnd(8)} ${c.branch.padEnd(40)} ${(c.by ?? "").padEnd(18)} ${when}`,
    );
  }
  const staleCount = all.filter(
    (c) => c.at && ageInDays(c.at, now) >= staleDays,
  ).length;
  if (staleCount) {
    console.log(`\n${staleCount} claim(s) with no activity for ${staleDays}+ days (marked !).`);
  }
  return 0;
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
