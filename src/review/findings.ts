/**
 * Reading a previous review well enough to know if a push answered it.
 *
 * The gate shipped in MO-26-08-02-03.25.14 asks "does this change contain
 * code?", which is right for a *first* review and wrong for a second. The most
 * valuable re-review in this rung's short history confirmed a fix to a roadmap
 * item's prose — a records-only change that the code test would skip, and that
 * the reviewer had itself asked for one pass earlier.
 *
 * So a re-review needs a second signal: **did this push touch something the
 * last review named?** That is not "did it fix it" — nothing short of another
 * review can say that, which is the point — but it is the cheap half, and it
 * is the half that decides whether spending the expensive half is worth it.
 *
 * Deliberately a heuristic, and shallow on purpose. A reviewer writes paths in
 * prose, and any parser for that is guessing; the failure this must avoid is
 * guessing *narrowly* and silently skipping the confirmation pass. So it errs
 * toward matching, and every rule here widens rather than narrows.
 */

/** `src/pm/claim.ts`, `.github/workflows/ci.yml`, `qa/acceptance/MO-051.md`. */
const PATH_LIKE = /(?:^|[\s`("'[])((?:[\w.-]+\/)+[\w.-]+\.\w{1,6})(?::\d+)?/g;

/**
 * Repo-relative paths a review mentions.
 *
 * Matches inside backticks, parentheses, quotes and bare prose, because a
 * review writes them all four ways. A trailing `:123` line number is dropped —
 * the file is the unit that gets edited, not the line.
 *
 * URLs are excluded: a review linking to GitHub docs is not naming a file in
 * this repository, and treating `docs.github.com/en/actions` as a path would
 * make almost any push look like it addressed something.
 */
export function pathsMentioned(reviewBody: string): string[] {
  const found = new Set<string>();

  // Strip fenced code blocks' *fences* but keep their content: reviews quote
  // the offending code, and the path is often in the line above it inside the
  // same block.
  const text = reviewBody.replace(/^```\w*$/gm, "");

  for (const m of text.matchAll(PATH_LIKE)) {
    const path = m[1]!;
    if (/^https?:/.test(path) || path.includes("://")) continue;
    // A bare domain (`docs.github.com/en/actions`) has no leading segment that
    // looks like a directory in this repo. Requiring a known-ish root is too
    // brittle across projects, so exclude the obvious web shapes only.
    if (/^(www\.|[\w-]+\.(com|org|net|io|dev|ai)\/)/.test(path)) continue;
    found.add(path);
  }

  return [...found].sort();
}

/**
 * True when a change set touches anything the previous review named.
 *
 * Substring-tolerant in one direction only: a review may cite
 * `tests/workflows.test.ts` while the diff reports the same path, but it may
 * also cite a directory-ish fragment. Exact match plus suffix match covers the
 * realistic cases without matching everything.
 */
export function addressesPriorFindings(
  changedFiles: string[],
  mentioned: string[],
): boolean {
  if (mentioned.length === 0) return false;
  return changedFiles.some((f) =>
    mentioned.some((m) => f === m || f.endsWith(`/${m}`) || m.endsWith(`/${f}`)),
  );
}
