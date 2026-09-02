import { hasNoSubstantiveChange, isRecordsOnly } from "../paths.js";
import { roadmapIdFromBranch } from "../pm/id.js";
import { parseArtifact } from "../pm/parse.js";
import {
  checkVisualEvidence,
  type VisualEvidencePolicy,
} from "./visual-evidence.js";
import { DEPENDABOT_LOGIN, isDependencyOnly } from "../dependabot/policy.js";

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
  /** Pull-request author login. Absent outside GitHub unless explicitly supplied. */
  author?: string;
  /**
   * Files that changed **on the base branch** since this branch left it — not
   * files this PR changed. CI cannot see a context receipt (`local/` is
   * gitignored, and a receipt is one machine's observation anyway), so this is
   * the freshness question CI *can* answer: did the canonical records move
   * under this branch while it was being written?
   */
  trunkChanges?: string[];
  /** Branch name, e.g. rm-014-calorie-pipeline. */
  branch: string;
  /** Paths changed in the PR, repo-relative. */
  changedFiles: string[];
  /** Repo-owned declaration of which changed paths require visual evidence. */
  visualEvidence?: VisualEvidencePolicy;
  /** Product directory to resolve roadmap items from. */
  productDir: string;
}

export interface Finding {
  /**
   * `waived` is a third level, not a flavour of warning.
   *
   * A verifier answers *is this correct?* without trusting the doer's own
   * say-so (architecture §9). `skip-tests:` and `records-only:` are written by
   * the author of the PR being checked, and until now they passed silently — so
   * a PR that excused itself from its tests was indistinguishable, in the check
   * output, from one that has them. The waivers are legitimate and stay; what
   * changes is that the rung above can see them.
   */
  level: "error" | "warning" | "waived";
  rule: string;
  message: string;
}

/**
 * A waiver line and the reason it gives.
 *
 * The reason must be more than a token. The original pattern was `\S+`, which
 * accepts `skip-tests: yes` — an opt-out with extra steps. Requiring words means
 * the author has to state something a human can weigh.
 */
export function waiverReason(body: string, key: string): string | null {
  // `[ \t]` rather than `\s`, which includes newlines: `\s*` after the colon
  // would swallow the blank line under a bare `skip-tests:` and capture the
  // *next* line as the reason. That made `skip-tests:` with nothing after it
  // read as the reason "## Test plan" — a non-reason passing as a good one,
  // which is the precise failure this rule exists to prevent.
  const m = new RegExp(`(^|\\n)[ \\t]*${key}:[ \\t]*(.*)$`, "im").exec(body);
  if (!m) return null;
  return (m[2] ?? "").trim();
}

/** Reasons that are present but say nothing. */
const NON_REASONS = new Set(["yes", "y", "true", "n/a", "na", "none", "ok", "-"]);

/** Exported for every waiver consumer — `check pr` and `review delivery` must agree. */
export function isRealReason(reason: string): boolean {
  return reason.length >= 4 && !NON_REASONS.has(reason.toLowerCase());
}

/**
 * The prose a reader actually sees — HTML comments and code spans removed.
 *
 * Waivers must be read from this, never from the raw body: a fenced or
 * backticked `review-waived: <reason>` is documentation *about* the waiver,
 * and matching it raw lets an example self-waive a required check.
 */
export function visibleProse(body: string): string {
  return stripCode(stripHtmlComments(body));
}

function stripHtmlComments(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, "");
}

/** Remove places where Markdown presents text as an example rather than prose. */
function stripCode(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\r\n]*`/g, "");
}

/** Whether the PR body uses one of GitHub's same-repository closing keywords. */
export function closesIssue(body: string, issue: number): boolean {
  const keyword = String.raw`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)`;
  // The pull-request template carries an example inside an HTML comment.
  // GitHub does not treat hidden template guidance as closure intent, so the
  // verifier must not let that example satisfy the rule either.
  const visible = visibleProse(body);
  // `_` is a regex word character but also Markdown emphasis, so `\b` would
  // reject `_Resolves #70_`. Exclude letters and digits explicitly instead.
  return new RegExp(String.raw`(?:^|[^A-Za-z0-9])${keyword}\s+#${issue}(?!\d)`, "im").test(
    visible,
  );
}

const SOURCE = /^src\/.*\.(ts|tsx)$/;
const TEST = /(^tests\/|\.test\.tsx?$)/;
const DOCS = /^(docs\/|architecture\.md$|AGENTS\.md$)|(^|\/)README\.md$/;
/**
 * The records a session is required to have loaded. Kept as a pattern rather
 * than imported from `session/lease.ts` so this check stays a pure function of
 * paths — `CANONICAL_INPUTS` is per-project and resolved from a manifest, and
 * `hq/team/` is matched wholesale because CI does not know whose branch it is.
 */
const CANONICAL = /^(AGENTS\.md$|CLAUDE\.md$|\.agent\/(decisions|learned)\.md$|hq\/team\/[^/]+\.md$)/;
const GENERATED = /^hq\/product\/(goals|requests)\/README\.md$/;

// `roadmapIdFromBranch` now lives in `pm/id.ts`, beside the patterns it has to
// agree with. Re-exported here because that is where it has always been
// imported from — a re-export alone would not bring it into local scope, and
// `checkPr` below calls it.
export { roadmapIdFromBranch };

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
  // Template guidance is not author input. Without stripping it, a heading
  // followed only by `<!-- what did you test? -->` satisfies the error-level
  // test-plan rule before the author writes one character.
  const lines = stripHtmlComments(body).split("\n");

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

  // Dependabot cannot write a human PR body or claim a roadmap item. Waive
  // those authoring conventions only when both independent facts agree: the
  // exact GitHub App login opened it, and every changed file is a recognized
  // dependency manifest or lockfile. A bot-named account or a source change
  // gets the normal checks plus an explicit scope failure.
  if (ctx.author === DEPENDABOT_LOGIN) {
    if (isDependencyOnly(changedFiles)) {
      return [
        {
          level: "waived",
          rule: "dependabot-contract",
          message:
            "human PR-body, visual-evidence, branch, and roadmap conventions waived for an exact Dependabot dependency-only change",
        },
      ];
    }

    findings.push({
      level: "error",
      rule: "dependabot-scope",
      message:
        "Dependabot changed a path outside the dependency manifest allowlist; refusing the bot waiver.",
    });
  }

  const source = changedFiles.filter((f) => SOURCE.test(f) && !TEST.test(f));
  const tests = changedFiles.filter((f) => TEST.test(f));
  const docs = changedFiles.filter((f) => DOCS.test(f) && !GENERATED.test(f));

  // Tests must accompany source changes, unless explicitly justified.
  const testsReason = waiverReason(body, "skip-tests");
  const testsWaived = testsReason !== null && isRealReason(testsReason);

  if (source.length > 0 && tests.length === 0 && !testsWaived) {
    findings.push({
      level: "error",
      rule: "tests-with-source",
      message:
        `${source.length} source file(s) changed with no test changes. Add tests, ` +
        `or put "skip-tests: <reason>" in the PR body.` +
        (testsReason !== null
          ? `\n    "${testsReason}" is not a reason — say why these changes cannot be tested.`
          : ""),
    });
  } else if (source.length > 0 && tests.length === 0 && testsWaived) {
    findings.push({
      level: "waived",
      rule: "tests-with-source",
      message: `tests waived — "${testsReason}"`,
    });
  }

  // A test plan is how a human knows what to verify on the preview.
  if (!hasSection(body, "Test plan")) {
    findings.push({
      level: "error",
      rule: "test-plan",
      message:
        'PR body needs a non-empty "## Test plan" section. ' +
        "For a local check, pass the GitHub body with MORPHEUS_PR_BODY.",
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

  findings.push(
    ...checkVisualEvidence({
      body,
      changedFiles,
      // Direct callers predating the policy are legacy manifests, not proof
      // that evidence is disabled. The CLI supplies an explicit invalid state
      // when morpheus.json itself cannot be read.
      policy: ctx.visualEvidence ?? { state: "absent" },
    }),
  );

  // A branch naming a roadmap item must move that item to review.
  //
  // Both failures below name the command that fixes them. The rule against
  // hand-naming was already documented when it broke three times — what was
  // missing was the recovery, at the moment someone is looking at the error.
  const id = roadmapIdFromBranch(branch);

  // Merging a branch that stakes an id marks that item shipped. So a PR on one
  // must have done that item's work — and a PR that changes only records and
  // board bookkeeping demonstrably has not.
  //
  // Waivable, because a few items genuinely deliver a decision rather than
  // code: MO-003's whole outcome was "do not publish, use a git dependency",
  // recorded in decisions.md. Stating the reason is cheap; the default must be
  // refusal, since the cost of a wrong shipped is that nobody looks again.
  // The third waiver, reported here for the same reason the other two are:
  // it is honoured by `review delivery` (a required check downstream), and a
  // waiver the conventions reader never sees is a waiver swallowed. Validity
  // is checked here too, so a non-reason surfaces before the delivery job
  // refuses it. Read from visible prose — a documented example must not waive.
  const reviewReason = waiverReason(visibleProse(body), "review-waived");
  if (reviewReason !== null && isRealReason(reviewReason)) {
    findings.push({
      level: "waived",
      rule: "review-waived",
      message: `agent review waived — "${reviewReason}"`,
    });
  } else if (reviewReason !== null) {
    findings.push({
      level: "error",
      rule: "review-waived",
      message:
        `"review-waived: ${reviewReason}" is not a reason — the delivery check will refuse it. ` +
        `Say why merging without the review is right.`,
    });
  }

  const recordsReason = waiverReason(body, "records-only");
  const recordsWaived = recordsReason !== null && isRealReason(recordsReason);

  if (id && hasNoSubstantiveChange(changedFiles)) {
    if (!recordsWaived) {
      findings.push({
        level: "error",
        rule: "no-work-for-claimed-item",
        message:
          `"${branch}" claims ${id}, but this PR changes only records and board files — ` +
          `no work on ${id} itself. Merging it would mark ${id} shipped. Move the commits ` +
          `to a branch that stakes no id (e.g. "inbox-2026-07-29"), or put ` +
          `"records-only: <reason>" in the body if the deliverable really is the record.` +
          (recordsReason !== null
            ? `\n    "${recordsReason}" is not a reason — say why the record is the deliverable.`
            : ""),
      });
    } else {
      findings.push({
        level: "waived",
        rule: "no-work-for-claimed-item",
        message: `${id} ships on records alone — "${recordsReason}"`,
      });
    }
  }

  if (isRecordsOnly(changedFiles)) {
    // Nothing to claim, so nothing more to require — the borrowing case is
    // already covered above.
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
    } else {
      const missingClosures = item.data.issues.filter((issue) => !closesIssue(body, issue));
      if (missingClosures.length) {
        findings.push({
          level: "error",
          rule: "issue-closure",
          message:
            `${id} declares GitHub issue${missingClosures.length === 1 ? "" : "s"} ` +
            `${missingClosures.map((issue) => `#${issue}`).join(", ")}, but the PR body does not ` +
            `close ${missingClosures.length === 1 ? "it" : "them"}. Add ` +
            missingClosures.map((issue) => `\"Closes #${issue}.\"`).join(" ") +
            " so GitHub closes the issue when this PR merges.",
        });
      }

      if (!["review", "shipped"].includes(item.data.status)) {
        findings.push({
          level: "error",
          rule: "roadmap-status",
          message:
            item.data.status === "blocked"
              ? `${id} is "blocked" and must keep its claimed branch for the partial work. ` +
                `Do not set it to "review" or merge this branch. Publish the block records on ` +
                `a branch that stakes no item (for example "inbox-<YYYY-MM-DD>").`
              : `${id} is "${item.data.status}" — set it to "review" when opening a PR, ` +
                `so the board does not lag the work.`,
        });
      }
    }
  }

  // The freshness protocol, from the outside. A warning rather than an error:
  // a trunk that moved mid-branch is nobody's mistake, and blocking on it
  // would fail PRs for something outside the author's control at write time.
  // The local gate is where refusal belongs; this is where it becomes visible
  // to whoever reads the check.
  const staleContext = (ctx.trunkChanges ?? []).filter((f: string) => CANONICAL.test(f));
  if (staleContext.length) {
    findings.push({
      level: "warning",
      rule: "context-drift",
      message:
        `Canonical records changed on the base branch while this one was open: ` +
        `${staleContext.join(", ")}. Merge the base and re-read them — ` +
        `\`morpheus context refresh\` prints what landed.`,
    });
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

const MARK: Record<Finding["level"], string> = {
  error: "✗",
  warning: "!",
  waived: "~",
};

/**
 * Render findings, never reporting a clean run when something was waived.
 *
 * The success line is the whole point of the change: a PR that excused itself
 * from its tests used to print exactly what a PR with tests printed, so the
 * waiver was only discoverable by reading the body it was hidden in.
 */
export function formatFindings(findings: Finding[]): string {
  const waived = findings.filter((f) => f.level === "waived");
  const rest = findings.filter((f) => f.level !== "waived");

  if (rest.length === 0 && waived.length === 0) return "✓ PR conventions satisfied.";

  const lines = findings.map((f) => `${MARK[f.level]} [${f.rule}] ${f.message}`);

  if (rest.length === 0) {
    return [
      `✓ PR conventions satisfied — ${waived.length} waived.`,
      ...lines,
    ].join("\n");
  }
  return lines.join("\n");
}
