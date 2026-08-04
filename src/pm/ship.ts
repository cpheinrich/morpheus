import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { branchPrefix, FETCH_PRUNE, findClaims } from "./claim.js";
import { hasNoSubstantiveChange } from "../paths.js";
import { parseArtifact } from "./parse.js";
import { today } from "./frontmatter.js";

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
  /** Paths the PR changed, or null when the list could not be read. */
  files: string[] | null;
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
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "300",
        "--json",
        "number,headRefName,files",
      ],
      { cwd },
    );
    const raw = JSON.parse(stdout) as Array<{
      number: number;
      headRefName: string;
      files?: Array<{ path: string }>;
    }>;
    return raw.map((p) => ({
      number: p.number,
      branch: p.headRefName,
      // Null, not [], when the field is absent. An unread file list must not
      // read as "this PR changed nothing".
      files: p.files ? p.files.map((f) => f.path) : null,
    }));
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
  | { kind: "unconfirmed"; id: string }
  /**
   * Backlog with a merged PR against its prefix. Reported without writing: the
   * item may have been reopened on purpose, and reconciliation cannot tell a
   * deliberate reopen from a status nobody updated.
   */
  | { kind: "reopened"; id: string; pr: number }
  /**
   * The merged PR changed nothing but records and board bookkeeping, so it did
   * not do this item's work. Reported without writing — this is the state that
   * marked MO-010 shipped against a PR that only moved the inbox.
   */
  | { kind: "no-work"; id: string; pr: number; branch: string }
  /**
   * Blocked with a merged PR against it. Reported without writing, for a
   * stronger reason than `reopened`: a merged PR on a blocked item is the
   * *expected* state, not evidence of completion. `pm block` records what is
   * outstanding in `needs:`, and `pm claim` deliberately leaves the branch on
   * origin so the partial work stays reachable. So the merged groundwork and
   * the unfinished item are both true at once, and only a human clearing
   * `needs:` can tell reconciliation which way to resolve it.
   */
  | { kind: "blocked"; id: string; pr: number; needs?: string };

export interface ReconcileResult {
  outcomes: ShipOutcome[];
  /** True when `gh` was unavailable, so nothing could be confirmed. */
  blind: boolean;
}

/**
 * True when a merged PR demonstrably did not do its item's work.
 *
 * `check pr` blocks this before a merge, but a gate only covers what passes
 * through it — all three historical instances merged green because the rule did
 * not exist yet. This is the same predicate from the other side, which is why
 * it comes from `paths.ts` rather than being restated here.
 *
 * `files === null` means the list could not be read, which is not evidence of
 * anything. Shipping proceeds in that case: refusing on an unread list would
 * stall every reconcile the day `gh` renames a field, and the failure this
 * guards against needs positive evidence, not its absence.
 */
export function didNoWork(pr: MergedPr): boolean {
  return pr.files !== null && hasNoSubstantiveChange(pr.files);
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
  let next = raw
    .replace(/^status:.*$/m, "status: shipped")
    .replace(/^updated:.*$/m, `updated: ${today()}`);

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
  await git([...FETCH_PRUNE], cwd).catch(() => "");

  const { items } = await parseArtifact(productDir, "roadmap");

  // Every non-terminal item, not just `review`. An item can merge without ever
  // passing through review — MO-015 did — and scanning only `review` leaves
  // exactly those sitting in backlog with a merged PR against them, which is
  // the most misleading state on the board.
  //
  // But `backlog` is only *reported*, never written. An item sitting in
  // backlog with a merged PR against it may have been deliberately reopened
  // because the PR addressed a symptom rather than the item — which is exactly
  // what happened to MO-015, twice. A tool that re-ships a deliberate reopen is
  // arguing with its owner.
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
      if (mergedHere && didNoWork(mergedHere)) {
        outcomes.push({
          kind: "no-work",
          id,
          pr: mergedHere.number,
          branch: mergedHere.branch,
        });
      } else if (mergedHere && item.data.status === "blocked") {
        // The branch surviving on origin is not staleness here — `pm claim`
        // leaves it there on purpose so the partial work stays reachable, and
        // says so. Writing `shipped` would retire an item whose `needs:` still
        // names outstanding work.
        outcomes.push({
          kind: "blocked",
          id,
          pr: mergedHere.number,
          needs: item.data.needs,
        });
      } else if (mergedHere) {
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

    if (didNoWork(pr)) {
      outcomes.push({ kind: "no-work", id, pr: pr.number, branch: pr.branch });
      continue;
    }
    if (item.data.status === "backlog") {
      outcomes.push({ kind: "reopened", id, pr: pr.number });
      continue;
    }
    if (item.data.status === "blocked") {
      outcomes.push({ kind: "blocked", id, pr: pr.number, needs: item.data.needs });
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
  const reopened = r.outcomes.filter((o): o is Extract<ShipOutcome, { kind: "reopened" }> =>
    o.kind === "reopened",
  );
  const noWork = r.outcomes.filter((o): o is Extract<ShipOutcome, { kind: "no-work" }> =>
    o.kind === "no-work",
  );
  const blocked = r.outcomes.filter((o): o is Extract<ShipOutcome, { kind: "blocked" }> =>
    o.kind === "blocked",
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
  if (reopened.length) {
    lines.push("\n\x1b[2mIn backlog with a merged PR — left alone in case the reopen was\ndeliberate:\x1b[0m");
    for (const o of reopened) lines.push(`  \x1b[2m${o.id} (#${o.pr})\x1b[0m`);
  }
  if (noWork.length) {
    lines.push(
      `\n\x1b[33m${noWork.length} item(s) NOT shipped — the merged PR changed only records and\nboard files, so it did not do the item's work:\x1b[0m`,
    );
    for (const o of noWork) lines.push(`  ${o.id}  \x1b[2m${o.branch} (#${o.pr})\x1b[0m`);
    lines.push(
      "\x1b[2m  This is how MO-010 was marked shipped against a PR that only moved the\n" +
        "  inbox. If the item really is done, `morpheus pm ship <ID>` says so\n" +
        "  deliberately.\x1b[0m",
    );
  }
  if (blocked.length) {
    lines.push(
      `\n\x1b[33m${blocked.length} blocked item(s) NOT shipped — a merged PR on a blocked item is\nthe expected state, not evidence the item is done:\x1b[0m`,
    );
    for (const o of blocked) {
      lines.push(`  ${o.id} \x1b[2m(#${o.pr})\x1b[0m`);
      if (o.needs) lines.push(`    \x1b[2mneeds: ${o.needs}\x1b[0m`);
    }
    lines.push(
      "\x1b[2m  Clear the blocker with `morpheus pm unblock <ID>` first. Reconciling\n" +
        "  these automatically would retire the item that records why the work is\n" +
        "  not finished.\x1b[0m",
    );
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
