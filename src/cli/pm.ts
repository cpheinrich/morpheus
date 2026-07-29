import { join } from "node:path";
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

/** Create a new item and print its path. */
export async function create(
  productDir: string,
  kind: string,
  title: string,
  opts: { priority?: string; goal?: string },
): Promise<number> {
  if (!isKind(kind)) {
    console.error(`Unknown kind "${kind}". Expected one of: ${KINDS.join(", ")}`);
    return 1;
  }
  if (!title) {
    console.error("A title is required.");
    return 1;
  }

  const path = await createItem({ productDir, kind, title, ...opts });
  console.log(`Created ${path}`);
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
