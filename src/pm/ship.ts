import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { branchPrefix, findClaims } from "./claim.js";
import { parseArtifact } from "./parse.js";

const exec = promisify(execFile);

/**
 * Closing the loop that `claim` opens.
 *
 * `pm claim` moves an item to in-progress and the PR moves it to review, but
 * nothing moved it to shipped — so merged work accumulated in review and the
 * roadmap stopped describing reality. Thirteen items had drifted before anyone
 * noticed, which is the tell: a status nobody advances is a status nobody
 * trusts.
 *
 * The claim model already holds the answer. The remote branch **is** the
 * claim, and merging deletes it, so a `review` item with no branch has almost
 * certainly shipped.
 *
 * **Almost** is the important word. A missing branch is the absence of
 * evidence, not evidence of a merge — the branch may have been deleted by
 * hand, or never pushed. So reconcile confirms against merged pull requests
 * and refuses to guess when it cannot: see `reconcile`.
 */

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

export interface MergedPr {
  number: number;
  branch: string;
}

/**
 * Merged pull requests, or null when `gh` cannot answer.
 *
 * Null and empty mean very different things here — no PRs found is evidence,
 * `gh` being absent is not — so they must not collapse into the same value.
 */
export async function mergedPrs(cwd: string): Promise<MergedPr[] | null> {
  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "list", "--state", "merged", "--limit", "300", "--json", "number,headRefName"],
      { cwd },
    );
    const raw = JSON.parse(stdout) as Array<{ number: number; headRefName: string }>;
    return raw.map((p) => ({ number: p.number, branch: p.headRefName }));
  } catch {
    return null;
  }
}

export type ShipOutcome =
  /** Marked shipped, with the PR that did it when one was found. */
  | { kind: "shipped"; id: string; pr?: number }
  /** Still claimed — the branch is on origin, so it has not merged. */
  | { kind: "open"; id: string; branch: string }
  /**
   * Merged, but the branch survived on origin — so it still reads as a live
   * claim and `pm claim` would refuse the item forever. Worth its own state:
   * a false claim is more damaging than a stale status, because it blocks
   * work rather than merely describing it wrongly.
   */
  | { kind: "stale"; id: string; branch: string; pr: number }
  /** No branch and no merged PR. Reported, never assumed. */
  | { kind: "unconfirmed"; id: string };

export interface ReconcileResult {
  outcomes: ShipOutcome[];
  /** True when `gh` was unavailable, so nothing could be confirmed. */
  blind: boolean;
}

/** Rewrite one item's status, and record the PR when we know it. */
export async function markShipped(
  productDir: string,
  id: string,
  pr?: number,
): Promise<void> {
  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new Error(`No roadmap item ${id} in ${productDir}/roadmap/`);

  const raw = await readFile(item.path, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  let next = raw
    .replace(/^status:.*$/m, "status: shipped")
    .replace(/^updated:.*$/m, `updated: ${today}`);

  if (pr !== undefined) {
    const existing = item.data.prs ?? [];
    if (!existing.includes(pr)) {
      const merged = [...existing, pr].sort((a, b) => a - b);
      next = /^prs:.*$/m.test(next)
        ? next.replace(/^prs:.*$/m, `prs: [${merged.join(", ")}]`)
        : next.replace(/^status:.*$/m, (s) => `${s}\nprs: [${merged.join(", ")}]`);
    }
  }
  await writeFile(item.path, next, "utf8");
}

/**
 * Move every merged `review` item to shipped.
 *
 * Confirms each one against a merged pull request whose head branch carries
 * the item's prefix. When `gh` is unavailable nothing is written — reporting
 * candidates is useful, but marking work shipped because a branch is missing
 * would let a hand-deleted branch quietly rewrite the roadmap.
 */
export async function reconcile(
  productDir: string,
  cwd: string,
  opts: { write: boolean } = { write: true },
): Promise<ReconcileResult> {
  await git(["fetch", "origin", "--prune", "--quiet"], cwd).catch(() => "");

  const { items } = await parseArtifact(productDir, "roadmap");

  // Every non-terminal item, not just `review`. An item can merge without ever
  // passing through review — MO-015 did — and scanning only `review` leaves
  // exactly those sitting in backlog with a merged PR against them, which is
  // the most misleading state on the board.
  const candidates = items.filter(
    (i) => i.data.status !== "shipped" && i.data.status !== "dropped",
  );
  const prs = await mergedPrs(cwd);
  const outcomes: ShipOutcome[] = [];

  for (const item of candidates) {
    const id = item.data.id;
    const inReview = item.data.status === "review";
    const claims = await findClaims(id, cwd);
    const pr = prs?.find((p) => p.branch.startsWith(branchPrefix(id)));

    if (claims.length > 0) {
      const mergedHere = prs?.find((p) => claims.includes(p.branch));
      if (mergedHere) {
        if (opts.write) await markShipped(productDir, id, mergedHere.number);
        outcomes.push({
          kind: "stale",
          id,
          branch: mergedHere.branch,
          pr: mergedHere.number,
        });
      } else if (inReview) {
        outcomes.push({ kind: "open", id, branch: claims[0]! });
      }
      // A claimed backlog or in-progress item is just work underway.
      continue;
    }

    if (!pr) {
      // Only `review` promises a merge. Backlog with no PR is not drift.
      if (inReview) outcomes.push({ kind: "unconfirmed", id });
      continue;
    }

    if (opts.write) await markShipped(productDir, id, pr.number);
    outcomes.push({ kind: "shipped", id, pr: pr.number });
  }

  return { outcomes, blind: prs === null };
}

export function formatReconcile(r: ReconcileResult): string {
  const shipped = r.outcomes.filter((o) => o.kind === "shipped");
  const open = r.outcomes.filter((o) => o.kind === "open");
  const unconfirmed = r.outcomes.filter((o) => o.kind === "unconfirmed");
  const stale = r.outcomes.filter((o): o is Extract<ShipOutcome, { kind: "stale" }> =>
    o.kind === "stale",
  );
  const lines: string[] = [];

  if (shipped.length) {
    lines.push(`\x1b[32mShipped ${shipped.length} item(s):\x1b[0m`);
    for (const o of shipped) {
      lines.push(`  ${o.id}${"pr" in o && o.pr ? ` \x1b[2m(#${o.pr})\x1b[0m` : ""}`);
    }
  }
  if (stale.length) {
    lines.push(
      `\n\x1b[33m${stale.length} merged branch(es) still on origin — these read as live claims:\x1b[0m`,
    );
    for (const o of stale) lines.push(`  ${o.id}  \x1b[2m${o.branch} (#${o.pr})\x1b[0m`);
    lines.push(
      "\x1b[2m  Marked shipped, but the branch blocks `pm claim` until it is gone:\n" +
        stale.map((o) => `    git push origin --delete ${o.branch}`).join("\n") +
        "\x1b[0m",
    );
  }
  if (open.length) {
    lines.push(`\n\x1b[2mStill open — branch is on origin:\x1b[0m`);
    for (const o of open) lines.push(`  \x1b[2m${o.id}\x1b[0m`);
  }
  if (unconfirmed.length) {
    lines.push(
      r.blind
        ? "\n\x1b[33mCould not reach `gh`, so nothing was confirmed or written.\x1b[0m"
        : "\n\x1b[33mNo branch and no merged PR — not assumed shipped:\x1b[0m",
    );
    for (const o of unconfirmed) lines.push(`  ${o.id}`);
    lines.push(
      "\x1b[2m  A missing branch is the absence of evidence, not evidence of a\n" +
        "  merge. Run `morpheus pm ship <ID>` if you know it shipped.\x1b[0m",
    );
  }
  if (!lines.length) return "\x1b[32m✓ Nothing in review.\x1b[0m";
  return lines.join("\n");
}
