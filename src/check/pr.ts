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

/** Extract the roadmap id a branch refers to: rm-014-slug -> RM-014. */
export function roadmapIdFromBranch(branch: string): string | null {
  const m = /^rm-(\d{3,})(?:-|$)/i.exec(branch);
  return m ? `RM-${m[1]}` : null;
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
  const id = roadmapIdFromBranch(branch);
  if (!id) {
    findings.push({
      level: "warning",
      rule: "branch-name",
      message: `Branch "${branch}" does not reference a roadmap item (expected rm-014-slug).`,
    });
  } else {
    const { items } = await parseArtifact(productDir, "roadmap");
    const item = items.find((i) => i.data.id === id);

    if (!item) {
      findings.push({
        level: "error",
        rule: "roadmap-item-exists",
        message: `Branch references ${id}, but no such item exists in ${productDir}/roadmap/.`,
      });
    } else if (!["review", "shipped"].includes(item.data.status)) {
      findings.push({
        level: "error",
        rule: "roadmap-status",
        message: `${id} is "${item.data.status}" — set it to "review" when opening a PR.`,
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
