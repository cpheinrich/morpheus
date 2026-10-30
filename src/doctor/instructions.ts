/**
 * The scaffold's `AGENTS.md` lines that a project cannot afford to lose.
 *
 * `morpheus init` writes the template once and never again, so a guidance
 * change in Morpheus reaches a consumer only when someone carries it there by
 * hand — and Evo's `AGENTS.md` never received the `wait-ci` line because its
 * rollout merged beside the change that introduced it. Nothing reported the
 * gap; agents there were simply never told. These anchors are what `doctor`
 * checks for, and a test holds the template (and Morpheus's own file) to them.
 *
 * Matched loosely — case, Markdown emphasis and line wrapping are ignored — so
 * a project may phrase the rule its own way. A missing anchor names the
 * guidance, not a line number, because the fix is to adopt the rule.
 */
export interface InstructionAnchor {
  /** Short name, as reported. */
  name: string;
  pattern: RegExp;
  /** What to carry over from the template. */
  add: string;
}

export const INSTRUCTION_ANCHORS: readonly InstructionAnchor[] = [
  {
    name: "wait-ci",
    pattern: /morpheus wait-ci/,
    add: "\"when the next step depends on CI, run `morpheus wait-ci <n>` once — never poll `gh run view` or `gh pr checks`\"",
  },
  {
    name: "wait-ci for workflow runs",
    pattern: /wait-ci --(?:run|workflow)\b/,
    add: "\"for a TestFlight, release or nightly run, `morpheus wait-ci --run <id>` (or `--workflow <file> --branch <b>`)\"",
  },
  {
    name: "break loops",
    pattern: /break loops/i,
    add: "the **Break loops** rule: the same failure twice, or the same poll three times, means stop and change approach",
  },
  {
    name: "focused tests",
    pattern: /focused (?:first|tests)/i,
    add: "the **focused first** testing rule: run the tests for the files you changed; at most one full suite per PR",
  },
  {
    name: "refresh on refusal",
    pattern: /refresh[^.]{0,60}\bonly\b[^.]{0,60}\brefus/i,
    add: "\"**Refresh again only when a gated command refuses**\" in Context freshness",
  },
  {
    // 2026-10-30: consumer AGENTS.md files still told agents the three-turn cap and the
    // same-reviewer rule, which is what left Evo's CD repair waiting on an approval.
    name: "five review turns",
    pattern: /five turns run without anyone's approval/i,
    add: "\"Five turns run without anyone's approval … A reviewer blocks only on substantive problems … When a reviewer times out or cannot be resumed, start a fresh one with the earlier findings\" in the review loop, replacing any three-turn or same-reviewer wording",
  },
];

/** Emphasis, code spans and wrapping removed, so `**Break\nloops.**` still reads as `Break loops.`. */
export function normalizeInstructions(text: string): string {
  return text.replace(/[*`]/g, "").replace(/\s+/g, " ");
}

export function missingInstructions(text: string, anchors: readonly InstructionAnchor[] = INSTRUCTION_ANCHORS): InstructionAnchor[] {
  const flat = normalizeInstructions(text);
  return anchors.filter((a) => !a.pattern.test(flat));
}
