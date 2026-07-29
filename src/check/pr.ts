import { parseArtifact } from "../pm/parse.js";

/**
 * PR conventions, enforced rather than requested.
 *
 * AGENTS.md asks for tests, docs, a test plan, and a roadmap status update.
 * Instructions get ignored eventually; a failing check does not. This module
 * is the enforcement half of that pair.
 */

export interface PrContext {
  /** PR body markdown. */
  body: string;
  /** Branch name, e.g. rm-014-calorie-pipeline. */
  branch: string;
  /** Paths changed in the PR, repo-relative. */
  changedFiles: string[];
  /** Product directory to resolve roadmap items from. */
  productDir: string;
}

export interface Finding {
  level: "error" | "warning";
  rule: string;
  message: string;
}

const SOURCE = /^src\/.*\.(ts|tsx)$/;
const TEST = /(^tests\/|\.test\.tsx?$)/;
const DOCS = /^(docs\/|architecture\.md$|README\.md$|AGENTS\.md$)/;
const GENERATED = /README\.md$/;

/**
 * Paths that record what happened rather than change what the software does:
 * an inbox cycle, a worklog entry, a decision.
 */
const RECORDS = /^(hq\/inbox\/|\.agent\/)/;

/**
 * True when every change is a record, so the PR needs no roadmap item.
 *
 * An inbox cycle is real work with nothing to claim — it belongs to no feature.
 * Without this it had to ride someone else's branch, and it did: PR #31 moved
 * the inbox on `mo-010-simplify-architecture-md`, which marked MO-010 shipped
 * with a PR that never touched architecture.md.
 *
 * The `length > 0` is load-bearing, not defensive. An empty list satisfies
 * `every` vacuously, so a failed `git diff` would exempt a PR from every
 * roadmap rule at once — the exact shape `.agent/learned.md` records under *a
 * check that skips what is absent will report an empty thing as correct*.
 */
export function isRecordsOnly(changedFiles: string[]): boolean {
  return changedFiles.length > 0 && changedFiles.every((f) => RECORDS.test(f));
}

/** Extract the roadmap id a branch refers to: ev-014-slug -> EV-014. */
export function roadmapIdFromBranch(branch: string): string | null {
  const m = /^([a-z]{2,4})-(\d{3,})(?:-|$)/i.exec(branch);
  return m ? `${m[1]!.toUpperCase()}-${m[2]}` : null;
}

/**
 * True when the PR body has a heading matching `heading` with non-empty
 * content beneath it, up to the next heading of any level.
 *
 * Done as a line scan rather than a regex: the "content until the next
 * heading or end of input" shape needs an end-of-string assertion, which
 * JavaScript spells awkwardly, and the scan reads better than the result.
 */
export function hasSection(body: string, heading: string): boolean {
  const want = heading.trim().toLowerCase();
  const lines = body.split("\n");

  let inSection = false;
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);

    if (m) {
      if (inSection) return false; // hit the next heading with nothing between
      inSection = m[2]!.toLowerCase() === want;
      continue;
    }
    if (inSection && line.trim().length > 0) return true;
  }
  return false;
}

export async function checkPr(ctx: PrContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const { body, branch, changedFiles, productDir } = ctx;

  const source = changedFiles.filter((f) => SOURCE.test(f) && !TEST.test(f));
  const tests = changedFiles.filter((f) => TEST.test(f));
  const docs = changedFiles.filter((f) => DOCS.test(f) && !GENERATED.test(f));

  // Tests must accompany source changes, unless explicitly justified.
  const testsWaived = /(^|\n)\s*skip-tests:\s*\S+/i.test(body);
  if (source.length > 0 && tests.length === 0 && !testsWaived) {
    findings.push({
      level: "error",
      rule: "tests-with-source",
      message:
        `${source.length} source file(s) changed with no test changes. Add tests, ` +
        `or put "skip-tests: <reason>" in the PR body.`,
    });
  }

  // A test plan is how a human knows what to verify on the preview.
  if (!hasSection(body, "Test plan")) {
    findings.push({
      level: "error",
      rule: "test-plan",
      message: 'PR body needs a non-empty "## Test plan" section.',
    });
  }

  // Open questions are surfaced, not guessed at.
  if (!hasSection(body, "Open questions")) {
    findings.push({
      level: "warning",
      rule: "open-questions",
      message:
        'No "## Open questions" section. Write "None" explicitly rather than omitting it.',
    });
  }

  // A branch naming a roadmap item must move that item to review.
  //
  // Both failures below name the command that fixes them. The rule against
  // hand-naming was already documented when it broke three times — what was
  // missing was the recovery, at the moment someone is looking at the error.
  const id = roadmapIdFromBranch(branch);
  if (isRecordsOnly(changedFiles)) {
    // Nothing to claim, so nothing to require — but borrowing a claim is worse
    // than having none, because merging releases it and reconcile marks the
    // item shipped against work the PR did not do.
    if (id) {
      findings.push({
        level: "error",
        rule: "records-on-claimed-branch",
        message:
          `This PR only changes records, but "${branch}" claims ${id}. Merging it would ` +
          `mark ${id} shipped against work it did not do. Move the commits to a branch ` +
          `that stakes no id, e.g. "inbox-2026-07-29".`,
      });
    }
  } else if (!id) {
    findings.push({
      level: "warning",
      rule: "branch-name",
      message:
        `Branch "${branch}" does not reference a roadmap item (expected mo-014-slug). ` +
        `Branches are derived, not typed: \`morpheus pm claim <ID>\` makes one from the id.`,
    });
  } else {
    const { items } = await parseArtifact(productDir, "roadmap");
    const item = items.find((i) => i.data.id === id);

    if (!item) {
      findings.push({
        level: "error",
        rule: "roadmap-item-exists",
        message:
          `Branch references ${id}, but no such item exists in ${productDir}/roadmap/. ` +
          `Create it with \`morpheus pm new roadmap "<title>"\`, then \`morpheus pm claim\` ` +
          `the id it allocates — claiming derives the branch, so the two cannot disagree.`,
      });
    } else if (!["review", "shipped"].includes(item.data.status)) {
      findings.push({
        level: "error",
        rule: "roadmap-status",
        message:
          `${id} is "${item.data.status}" — set it to "review" when opening a PR, ` +
          `so the board does not lag the work.`,
      });
    }
  }

  // Behaviour changes should land with the docs that describe them.
  const changedPublicApi = source.some((f) => /\/index\.ts$/.test(f));
  if (changedPublicApi && docs.length === 0) {
    findings.push({
      level: "warning",
      rule: "docs-with-api",
      message: "A public entry point changed but no documentation did.",
    });
  }

  return findings;
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "✓ PR conventions satisfied.";
  return findings
    .map((f) => `${f.level === "error" ? "✗" : "!"} [${f.rule}] ${f.message}`)
    .join("\n");
}
