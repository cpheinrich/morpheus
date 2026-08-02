import { execFileSync } from "node:child_process";
import { hasNoSubstantiveChange } from "../paths.js";
import { loadReviewContext, ReviewError } from "../review/context.js";
import { buildReviewPrompt } from "../review/prompt.js";

/**
 * `morpheus review prompt` — assemble the rung 2 reviewer prompt and print it.
 * `morpheus review needed` — decide whether it is worth spending a review.
 *
 * Commands rather than logic inside the workflow, for the reason the rest of
 * the kit is: YAML is the one part with no type checker and no tests behind it,
 * so the judgment belongs in a module that has both.
 */

function currentBranch(): string {
  if (process.env["GITHUB_HEAD_REF"]) return process.env["GITHUB_HEAD_REF"];
  if (process.env["MORPHEUS_BRANCH"]) return process.env["MORPHEUS_BRANCH"];
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

export async function prompt(productDir: string, root: string): Promise<number> {
  try {
    const ctx = await loadReviewContext({ root, productDir, branch: currentBranch() });
    console.log(buildReviewPrompt(ctx));
    return 0;
  } catch (err) {
    if (err instanceof ReviewError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

/**
 * Whether this change is worth spending a review on.
 *
 * Rung 2 reads code. A push that changes only records and board bookkeeping has
 * nothing for it, and the bill says so: of the seven review runs during MO-051's
 * rollout, **four reviewed pushes that changed no code** — three of them
 * successive edits to one roadmap item's prose — for $4.93 of $8.01.
 *
 * The predicate is `hasNoSubstantiveChange`, the same one `check pr` uses to
 * refuse a claimed branch that did no work and `pm ship` uses to refuse a merged
 * PR that did none. Three consumers now, one definition — this repo has spent
 * the day fixing bugs caused by the second copy of something.
 *
 * The trade is real and worth stating: the reviewer *did* find genuine problems
 * in item prose, including a claim that a file existed when it did not. This
 * gives that up to stop paying a dollar a push to re-read a paragraph. Prints a
 * reason either way so the skip is legible in the job log rather than silent.
 */
export function needed(changedFiles: string[]): { review: boolean; why: string } {
  if (changedFiles.length === 0) {
    // An unreadable diff is not an empty one. Review rather than skip: the cost
    // of a wasted run is a dollar, the cost of silently skipping every review
    // the day `git diff` changes shape is the rung.
    return { review: true, why: "could not read the changed files — reviewing rather than assuming" };
  }
  if (hasNoSubstantiveChange(changedFiles)) {
    return {
      review: false,
      why: `${changedFiles.length} file(s) changed, all records or board bookkeeping — nothing for a code reviewer`,
    };
  }
  return { review: true, why: `${changedFiles.length} file(s) changed` };
}

function changedFiles(base: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      encoding: "utf8",
    }).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Prints `true` or `false` for the workflow to gate on. Always exits 0. */
export function reviewNeeded(base: string): number {
  const { review, why } = needed(changedFiles(base));
  console.log(String(review));
  console.error(review ? `Reviewing: ${why}` : `Skipping: ${why}`);
  return 0;
}
