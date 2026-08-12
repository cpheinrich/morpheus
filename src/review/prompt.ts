/**
 * Assembling the prompt for verifier rung 2 — agent code review.
 *
 * The reviewer is a *second* session. That independence is the entire point:
 * an agent reviewing its own work re-derives the same reasoning and reaches the
 * same wrong conclusion, so "the agent self-reviewed" is not a rung.
 *
 * Deliberately **not** a diff dump. The reviewer already has the repository and
 * the pull request; what it cannot infer is *what the change was supposed to
 * do*. So the prompt carries intent — the roadmap item, its acceptance
 * criteria, and the settled decisions it must not quietly reverse — and leaves
 * reading the code to the reviewer.
 *
 * Pure, so the judgment encoded here is testable without a model.
 */

import { REVIEW_DELIVERED_SENTINEL } from "./delivery.js";

export interface ReviewContext {
  /** The reviewer persona, from `.github/agent-review-prompt.md`. */
  persona: string;
  /** Roadmap id the branch claims, if any. */
  id?: string;
  /** The item's title. */
  title?: string;
  /** The item's markdown body — its stated intent. */
  intent?: string;
  /** Contents of the item's `acceptance` file, when it declares one. */
  acceptance?: string;
  /** Path that `acceptance` pointed at but which does not exist. */
  missingAcceptance?: string;
}

function section(heading: string, body: string): string {
  return `\n\n## ${heading}\n\n${body.trim()}`;
}

/**
 * Build the reviewer's prompt.
 *
 * The conformance section is **omitted entirely** rather than rendered empty
 * when an item declares no acceptance criteria. An empty heading reads as "there
 * are no criteria to meet", which is a different and much weaker claim than "no
 * criteria were stated" — and a reviewer told the former will stop looking.
 */
export function buildReviewPrompt(ctx: ReviewContext): string {
  const parts: string[] = [ctx.persona.trim()];

  if (ctx.id && ctx.title) {
    parts.push(
      section(
        `What this change was supposed to do — ${ctx.id}`,
        `**${ctx.title}**\n\n${ctx.intent?.trim() || "_The item records no detail beyond its title._"}`,
      ),
    );
  } else {
    parts.push(
      section(
        "What this change was supposed to do",
        "This branch names no roadmap item, so there is no stated intent to compare against. " +
          "Say so in your review — a change with no declared purpose cannot be checked for " +
          "conformance, and that is itself worth reporting.",
      ),
    );
  }

  if (ctx.acceptance) {
    parts.push(
      section(
        "Acceptance criteria",
        `${ctx.acceptance.trim()}\n\n` +
          "Check the change against each of these explicitly. This is the difference between " +
          '"the code is clean" and "the code does what was asked".',
      ),
    );
  }

  // A dangling reference is a mistake, not an absence. Treating it as "no
  // criteria" is how the `acceptance` field stayed dead for two months.
  if (ctx.missingAcceptance) {
    parts.push(
      section(
        "Acceptance criteria — missing",
        `${ctx.id ?? "The item"} declares \`acceptance: ${ctx.missingAcceptance}\`, but no such ` +
          `file exists. Report this: a dangling reference is a defect in its own right, and it ` +
          `means nobody can check conformance for this change.`,
      ),
    );
  }

  // This instruction travels with the detector in `.morpheus`, not with the
  // caller's copied persona. Appending it last also keeps it after item intent
  // and acceptance text, where the reviewer is least likely to lose it.
  parts.push(
    section(
      "Delivery contract",
      `After the completed review text, include this exact raw line:\n\n` +
        `${REVIEW_DELIVERED_SENTINEL}\n\n` +
        "Do not wrap it in backticks or a code fence, and never include it in a progress update. " +
        "The workflow uses it only as evidence that the final review was delivered.",
    ),
  );

  return parts.join("");
}

/**
 * Resolve an item's `acceptance` value to a repo-relative path.
 *
 * The schema documents it as "a path into `qa/acceptance/`", which has been
 * written both ways in practice — bare filename and full path. Accepting both
 * costs one branch; guessing wrong makes a declared criterion silently missing,
 * which is the failure mode this rung exists to catch.
 */
export function acceptancePath(value: string): string {
  return value.startsWith("qa/") ? value : `qa/acceptance/${value}`;
}
