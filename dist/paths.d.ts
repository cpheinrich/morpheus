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
 * Where collaborative context lives.
 *
 * One definition, because nine modules held the old path as a literal and the
 * move to `hq/team/` would have needed all nine changed in step. Three bugs in
 * one week here came from a value written twice and drifting — the branch-id
 * pattern, the fetch arguments, and the `today()` timezone. A tenth copy was
 * not going to be the one that held.
 *
 * **Inboxes sit at the root of `hq/team/`**, not in a subdirectory:
 * `hq/team/cpheinrich.md`. A person is the primary thing in this folder, and
 * `hq/team/inbox/cpheinrich.md` would put a medium above a person.
 */
export declare const TEAM_DIR = "hq/team";
/** Inboxes are files directly under `hq/team/`, one per GitHub handle. */
export declare const INBOX_DIR = "hq/team";
export declare const MEETING_NOTES_DIR = "hq/team/meeting-notes";
/**
 * The roster. Markdown with frontmatter, not YAML — `gray-matter` is already a
 * runtime dependency and `yaml` is not, and `morpheus-kit` ships to every
 * project, so one file is not worth a new dependency in all of them. It also
 * keeps `hq/` uniform: everything a human edits here is markdown with
 * frontmatter, which is what makes third-party editors safe (decisions.md).
 */
export declare const MEMBERS_FILE = "hq/team/members.md";
/**
 * Files in `hq/team/` that are *not* somebody's inbox.
 *
 * Inboxes are named for a person and sit at the root of the folder, so anything
 * else at that root has to be named explicitly — otherwise `inbox validate`
 * reads the roster as an inbox and reports three schema errors about a file
 * that is perfectly valid. One list, because `inbox validate` and any future
 * reader must agree on what an inbox is.
 */
export declare const TEAM_RESERVED: Set<string>;
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
export declare function isRecordsOnly(changedFiles: string[]): boolean;
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
export declare function hasNoSubstantiveChange(changedFiles: string[]): boolean;
