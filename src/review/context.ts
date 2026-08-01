import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { roadmapIdFromBranch } from "../check/pr.js";
import { parseArtifact } from "../pm/parse.js";
import { acceptancePath, type ReviewContext } from "./prompt.js";

/** Where the reviewer persona lives. Versioned, so it is reviewable itself. */
export const PERSONA_PATH = ".github/agent-review-prompt.md";

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export class ReviewError extends Error {}

export interface LoadOptions {
  root: string;
  productDir: string;
  branch: string;
}

/**
 * Gather everything the reviewer needs to know about intent.
 *
 * The persona is required — running rung 2 with no persona would produce a
 * generic "look for bugs" review, which is the rung below with a model bolted
 * on. Everything else is optional and its absence is reported to the reviewer
 * rather than hidden from it.
 */
export async function loadReviewContext(opts: LoadOptions): Promise<ReviewContext> {
  const { root, productDir, branch } = opts;

  const persona = await readIfExists(join(root, PERSONA_PATH));
  if (persona === null) {
    throw new ReviewError(
      `No reviewer persona at ${PERSONA_PATH}. Rung 2 without one is rung 1 with a model ` +
        `attached — copy the file from Morpheus rather than running generic review.`,
    );
  }

  const id = roadmapIdFromBranch(branch);
  if (!id) return { persona };

  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) return { persona, id };

  const ctx: ReviewContext = {
    persona,
    id,
    title: item.data.title,
    intent: item.body,
  };

  if (item.data.acceptance) {
    const rel = acceptancePath(item.data.acceptance);
    const text = await readIfExists(join(root, rel));
    if (text === null) ctx.missingAcceptance = rel;
    else ctx.acceptance = text;
  }

  return ctx;
}
