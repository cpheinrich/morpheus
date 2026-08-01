import { execFileSync } from "node:child_process";
import { loadReviewContext, ReviewError } from "../review/context.js";
import { buildReviewPrompt } from "../review/prompt.js";

/**
 * `morpheus review prompt` — assemble the rung 2 reviewer prompt and print it.
 *
 * A command rather than logic inside the workflow, for the reason the rest of
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
