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
const PATH_LIKE = /((?:[\w.-]+\/)+[\w.-]+\.\w{1,6})(?::\d+)?/g;

/** Anything with a scheme, or `www.`, plus everything after it. */
const URL_LIKE = /\b(?:[a-z][\w+.-]*:\/\/|www\.)\S+/gi;

/** A scheme-less web address — `docs.github.com/en/actions/foo.yml`. */
const BARE_DOMAIN = /\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|ai|gov|edu|co|sh)\/\S*/gi;

/**
 * Repo-relative paths a review mentions.
 *
 * A trailing `:123` line number is dropped — the file is the unit that gets
 * edited, not the line.
 *
 * **URLs are removed before matching, not filtered after.** The first version
 * did it the other way and the guards were unreachable: the capture group is
 * `[\w.-]` and `/`, so it can never contain a colon, and `/^https?:/` therefore
 * never fired. The URL test passed anyway — because the *leading boundary
 * class* refused to start a match at `//docs…` — which meant one mechanism was
 * silently doing two jobs and the test proved neither.
 *
 * That mattered because the boundary class was also the bug: it listed
 * whitespace, backtick, paren, quote and bracket, and therefore missed
 * `**src/cli/review.ts**` — bold being the single most common way a reviewer
 * cites a file. The module promised to widen rather than narrow and did the
 * opposite in the one place that counted. Removing URLs explicitly is what
 * allows the boundary to go away entirely.
 */
export function pathsMentioned(reviewBody: string): string[] {
  const found = new Set<string>();

  // Strip fenced code blocks' *fences* but keep their content: reviews quote
  // the offending code, and the path is often in the line above it inside the
  // same block.
  const text = reviewBody
    .replace(/^```\w*$/gm, "")
    .replace(URL_LIKE, " ")
    .replace(BARE_DOMAIN, " ");

  for (const m of text.matchAll(PATH_LIKE)) found.add(m[1]!);

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
