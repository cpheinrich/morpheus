/**
 * Roadmap ids.
 *
 * A sequential integer requires every writer to agree on what the last one was,
 * and that agreement does not exist. In one day `pm new` offered an id a
 * parallel session held as an untracked file, would have offered one an open
 * PR's branch held, and four items were created in the *same second* by a
 * decomposition fan-out. Forks make it unfixable rather than awkward: a
 * contributor's `origin` is their fork, so no query tells them the truth.
 *
 * So ids come from the clock instead, which needs no coordination and no
 * network — preserving the offline allocation `pm new` deliberately supports.
 *
 * | Form | Shape | Example |
 * |---|---|---|
 * | New | `PREFIX-YY-MM-DD-HH.MM.SS` in Pacific | `MO-26-08-01-15.26.34` |
 * | Legacy | `PREFIX-YY-MM-DD-NNN` | `MO-26-07-29-045` |
 *
 * A four-digit year is still accepted: items created between the format
 * landing and the migration sweep carry one, and rejecting them would fail the
 * board that produced them.
 *
 * Legacy ids keep the item's **own** `created:` date and its old integer, so
 * `grep MO-045` still finds it in the git history, commit messages and merged
 * PR bodies that cannot be rewritten — and real chronology survives instead of
 * every migrated item collapsing onto the migration date.
 *
 * Goals and requests keep their sequential schemes. They are rare, written
 * deliberately, and have never collided. Goals scope that sequence to a
 * period — `MO-G-2026-Q3-01` — because a goal is a thing you set *for* a
 * quarter, and an id that cannot say which one has to be read alongside the
 * file to mean anything.
 */
/**
 * The one roadmap-id pattern. `schema.ts` imports this rather than restating
 * it — the first draft of MO-057 had two constants of the same name with
 * different meanings, which is the drift MO-004 exists to prevent.
 *
 * Three shapes are accepted: `MO-2026-08-01-15.26.34` (timestamp),
 * `MO-2026-07-29-045` (migrated), and `MO-045` (not yet migrated). The last is kept because the
 * scheme ships before the sweep, and a validator that rejected the current
 * board would turn every project red the moment this landed.
 */
export declare const ROADMAP_ID: RegExp;
/** Just the two dated shapes — what `pm new` now produces. */
export declare const DATED_ROADMAP_ID: RegExp;
/**
 * Hard character ceiling.
 *
 * 32, not 64. A slug is a handle, not a summary — the description belongs in
 * the title and the body, and the id above it is already unique, so the slug
 * carries none of the burden of saying what the work *is*.
 */
export declare const SLUG_MAX = 32;
/**
 * Words kept, before the character ceiling applies.
 *
 * Brevity is the goal: a slug identifies, it does not describe. It should read
 * like a branch name — **verb-noun**, two to four words: `fix-photo-picker`,
 * `add-photo-session`, `update-roadmap-ids`. It does **not** need to be
 * unique, because the timestamp above it already is.
 *
 * **Prefer `--slug`.** No sentence reliably reduces to verb-noun, so an agent
 * choosing three words beats any transformation of the title:
 * "Roadmap ids become timestamps, not a coordinated integer" derives to
 * `roadmap-ids-become-timestamps`, where `update-roadmap-ids` says as much in
 * half the space. The derived form is a fallback, not the intent.
 */
export declare const SLUG_MAX_WORDS = 4;
export interface ParsedId {
    prefix: string;
    /** `YY-MM-DD` as written in the id. */
    date: string;
    /** `HH.MM.SS`, or the old integer for a migrated item. */
    tail: string;
    legacy: boolean;
}
export declare function parseRoadmapId(id: string): ParsedId | null;
/** True for an id migrated from the integer scheme. */
export declare function isLegacyId(id: string): boolean;
/** `YY-MM-DD` in Pacific time — two-digit year, two characters cheaper. */
export declare function datePart(d: Date): string;
/**
 * `YYYY-Qn` in the same fixed zone the ids use.
 *
 * A goal id **contains** its period (`MO-G-2026-Q3-01`), so the id and the
 * `period:` field beside it are two renderings of one fact. Deriving both from
 * here is what keeps them from disagreeing — the first version hardcoded `Q1`
 * in the frontmatter while the id carried no period at all, and a goal written
 * in August claimed to be a Q1 goal.
 */
export declare function periodInZone(d?: Date): string;
/**
 * `YYYY-MM-DD` in the same fixed zone the ids use.
 *
 * Exported from here rather than defined where it is needed, so there is one
 * `ZONE`. Anything dating a file from `toISOString()` gets UTC, which after
 * 5pm Pacific is already tomorrow — a handoff written the same afternoon as an
 * item would carry a date a day ahead of the item's id, and the two would sort
 * against each other wrongly.
 */
export declare function isoDateInZone(d?: Date): string;
/**
 * `HH.MM.SS` in Pacific time.
 *
 * Dots rather than colons because git **rejects a colon in a branch name**
 * outright, and `pm claim` derives the branch from the id, so every claim would
 * fail. Files containing colons also stage on macOS but cannot be checked out
 * on Windows. Dots say "clock" without either problem.
 */
export declare function timePart(d: Date): string;
/**
 * A timestamp id, stepped forward until it is free.
 *
 * `taken` is every id already present. A fan-out creating four items in one
 * second gets `:34 :35 :36 :37`: ordering is preserved, the result is
 * deterministic, and no randomness is needed. The id is a logical identifier
 * that happens to read as a time, not a clock reading — a second of drift buys
 * a guarantee worth more than the precision it costs.
 */
export declare function timestampId(prefix: string, taken: Iterable<string>, now: Date): string;
/** The id a migrated item takes: its own creation date plus its old number. */
export declare function migratedId(prefix: string, created: string, oldNumber: number): string;
/**
 * A slug: lowercase, hyphenated, short, and cut at a **word** boundary.
 *
 * Three passes, in order:
 *
 * 1. **Abbreviate** — `external` becomes `ext`
 * 2. **Drop stop words** — `open-an-issue` becomes `open-issue`
 * 3. **Keep the first `SLUG_MAX_WORDS`**, then trim any trailing stop word or
 *    dangling negation
 *
 * Mid-word truncation produces noise (`project-manageme`), and truncation that
 * lands on a stop word produces a slug ending in `-and`, which is how this was
 * noticed. Trailing stop words are stripped after the cut as well as before it,
 * since dropping them can shift which word lands last.
 *
 * Measured across 80 real items the median title slugified to 47 characters
 * before these rules; they take it well below that.
 */
export declare function slugForFilename(title: string, max?: number): string;
/**
 * Sanitise a slug supplied by hand.
 *
 * Trusted for *wording* — the caller chose it, so no stop words are dropped and
 * nothing is abbreviated — but not for *shape*: it still has to be a legal
 * filename and git ref component.
 */
export declare function cleanSlug(slug: string): string;
/** `MO-26-08-01-15.26.34-blocked-first-class-outcome.md` */
export declare function itemFilename(id: string, title: string, max?: number, chosen?: string): string;
/**
 * Extract the roadmap id a branch refers to.
 *
 * Three shapes, because MO-057 changed the scheme and branches outlive it:
 *
 * | Branch | Id |
 * |---|---|
 * | `mo-26-08-01-15.26.34-slug` | `MO-26-08-01-15.26.34` |
 * | `mo-26-07-29-045-slug` | `MO-26-07-29-045` |
 * | `ev-014-slug` | `EV-014` |
 *
 * A four-digit year is also accepted — branches cut between the format landing
 * and the migration sweep carry one.
 *
 * The dated forms must be tried **first**. Matching the legacy pattern against
 * `mo-26-08-01-...` or `mo-2026-08-01-...` yields `MO-26` or `MO-2026` — a plausible-looking id for an item
 * that cannot exist — and the check then reports the branch as referencing a
 * missing item. That is what it did on the first PR created under the new
 * scheme.
 *
 * **Every consumer must use this one.** `listClaims` kept its own copy and
 * drifted, in two directions at once: `cph-2026-08-01-22.49.21-…` truncated to
 * `CPH-2026`, and `mo-26-08-01-…` — what `pm new` produces today — did not match
 * at all, so the claim was dropped from the list silently. A claim missing from
 * the list is worse than a mangled one: the heartbeat counts what is in flight
 * from exactly that list, so its ceiling stopped holding and it offered work
 * another session already held.
 */
export declare function roadmapIdFromBranch(branch: string): string | null;
