/**
 * What a changed path means.
 *
 * Lives at the root rather than inside `check/` because two places need the
 * same answer and must not drift: `check pr` gates a PR before it merges, and
 * `pm ship` decides afterwards whether a merged PR really did an item's work.
 * `check/pr.ts` already imports from `pm/`, so defining it in either would make
 * the dependency circular — and duplicating it would recreate the risk the
 * second caller exists to close.
 */

/**
 * Paths that record what happened rather than change what the software does:
 * an inbox cycle, a worklog entry, a decision.
 */
const RECORDS = /^(hq\/inbox\/|\.agent\/)/;

/** Board bookkeeping: item frontmatter and the generated index tables. */
const BOARD = /^hq\/product\//;

/**
 * True when every change is a record, so the PR needs no roadmap item.
 *
 * An inbox cycle is real work with nothing to claim — it belongs to no feature.
 * Without this it had to ride someone else's branch, and it did: PR #31 moved
 * the inbox on `mo-010-simplify-architecture-md`, which marked MO-010 shipped
 * with a PR that never touched architecture.md.
 *
 * Deliberately narrower than `hasNoSubstantiveChange`: if touching the board
 * could satisfy "needs no roadmap item", a PR could excuse itself from the
 * roadmap rules by editing the roadmap.
 *
 * The `length > 0` is load-bearing, not defensive. An empty list satisfies
 * `every` vacuously, so a failed `git diff` would exempt a PR from every
 * roadmap rule at once — the exact shape `.agent/learned.md` records under *a
 * check that skips what is absent will report an empty thing as correct*.
 */
export function isRecordsOnly(changedFiles: string[]): boolean {
  return changedFiles.length > 0 && changedFiles.every((f) => RECORDS.test(f));
}

/**
 * True when a change set is nothing but records and board bookkeeping — so
 * whatever item its branch claims, it did not do that item's work.
 *
 * A borrowed branch always carries board files: claiming reconciles statuses
 * and `pm index` regenerates the tables, so those ride along in the same
 * commit. PR #31 shipped MO-010 with exactly that mix, and is `false` under
 * `isRecordsOnly` for precisely the reason it needed catching.
 *
 * Empty is `false` here for the same reason as above, and it matters more:
 * callers use this to *refuse* an action, so a vacuous true would refuse
 * legitimate work whenever the file list could not be read.
 */
export function hasNoSubstantiveChange(changedFiles: string[]): boolean {
  return (
    changedFiles.length > 0 && changedFiles.every((f) => RECORDS.test(f) || BOARD.test(f))
  );
}
