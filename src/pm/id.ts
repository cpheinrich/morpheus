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
 * deliberately, and have never collided.
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
export const ROADMAP_ID =
  /^[A-Z]{2,4}-((?:\d{2}|\d{4})-\d{2}-\d{2}-(?:\d{2}\.\d{2}\.\d{2}|\d{3})|\d{3,})$/;

/** Just the two dated shapes — what `pm new` now produces. */
export const DATED_ROADMAP_ID =
  /^[A-Z]{2,4}-(?:\d{2}|\d{4})-\d{2}-\d{2}-(?:\d{2}\.\d{2}\.\d{2}|\d{3})$/;

/**
 * Hard character ceiling.
 *
 * 32, not 64. A slug is a handle, not a summary — the description belongs in
 * the title and the body, and the id above it is already unique, so the slug
 * carries none of the burden of saying what the work *is*.
 */
export const SLUG_MAX = 32;

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
export const SLUG_MAX_WORDS = 4;

/**
 * Never the last word of a slug.
 *
 * Two kinds, both reading as a thought cut in half. A trailing **negation**
 * has lost the thing it negates — `…-timestamps-not`. A trailing **modal** has
 * lost its verb — `…-open-issue-may`, which is the same defect as ending on
 * `and`.
 *
 * Trimmed only from the end, not removed throughout: `must` and `not` carry
 * meaning in the middle of a title, and dropping them there would invert it.
 */
const DANGLING = new Set([
  "not", "no", "never", "without", "vs", "than",
  "may", "can", "will", "shall", "should", "must", "might", "could", "would",
]);

export interface ParsedId {
  prefix: string;
  /** `YY-MM-DD` as written in the id. */
  date: string;
  /** `HH.MM.SS`, or the old integer for a migrated item. */
  tail: string;
  legacy: boolean;
}

export function parseRoadmapId(id: string): ParsedId | null {
  const m = /^([A-Z]{2,4})-((?:\d{2}|\d{4})-\d{2}-\d{2})-(\d{2}\.\d{2}\.\d{2}|\d{3})$/.exec(id);
  if (!m) return null;
  return { prefix: m[1]!, date: m[2]!, tail: m[3]!, legacy: !m[3]!.includes(".") };
}

/** True for an id migrated from the integer scheme. */
export function isLegacyId(id: string): boolean {
  return parseRoadmapId(id)?.legacy ?? false;
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * **Ids are in Pacific time (America/Los_Angeles), on every machine.**
 *
 * Not the author's local zone — a *fixed* zone. That distinction is the whole
 * point. Ordering is the scheme's only job and is meaningless if two authors
 * measure from different origins: under local time an item written in Tokyo at
 * 09:00 sorts *after* one written in Los Angeles an hour later, because the
 * calendar days differ. Pinning one zone makes every id comparable no matter
 * where it was created, while reading as the wall clock of the person who runs
 * this most.
 *
 * The first draft used the machine's local time, which also disagreed with the
 * file it sat in: `created:` is `toISOString()` and therefore UTC, so an item
 * written at 00:30 UTC from Los Angeles read `id: MO-2026-08-01-17.30.00`
 * against `created: 2026-08-02` — two different days in one frontmatter.
 *
 * **Known cost: the DST fall-back hour.** Pacific repeats 01:00–02:00 once a
 * year, so two items written an hour apart can produce the same id. The
 * collision step in `timestampId` resolves it, but their relative order within
 * that hour is not guaranteed. One hour a year, in exchange for ids that read
 * as the time the author actually saw.
 */
const ZONE = "America/Los_Angeles";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // `h23` rather than `hour12: false`, which yields "24" for midnight in some
  // runtimes and would produce an id no parser accepts.
  hourCycle: "h23",
});

function zoned(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PARTS.formatToParts(d)) if (p.type !== "literal") out[p.type] = p.value;
  return out;
}

/** `YY-MM-DD` in Pacific time — two-digit year, two characters cheaper. */
export function datePart(d: Date): string {
  const p = zoned(d);
  return `${p.year!.slice(-2)}-${p.month}-${p.day}`;
}

/**
 * `YYYY-MM-DD` in the same fixed zone the ids use.
 *
 * Exported from here rather than defined where it is needed, so there is one
 * `ZONE`. Anything dating a file from `toISOString()` gets UTC, which after
 * 5pm Pacific is already tomorrow — a handoff written the same afternoon as an
 * item would carry a date a day ahead of the item's id, and the two would sort
 * against each other wrongly.
 */
export function isoDateInZone(d: Date = new Date()): string {
  const p = zoned(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * `HH.MM.SS` in Pacific time.
 *
 * Dots rather than colons because git **rejects a colon in a branch name**
 * outright, and `pm claim` derives the branch from the id, so every claim would
 * fail. Files containing colons also stage on macOS but cannot be checked out
 * on Windows. Dots say "clock" without either problem.
 */
export function timePart(d: Date): string {
  const p = zoned(d);
  return `${p.hour}.${p.minute}.${p.second}`;
}

/**
 * A timestamp id, stepped forward until it is free.
 *
 * `taken` is every id already present. A fan-out creating four items in one
 * second gets `:34 :35 :36 :37`: ordering is preserved, the result is
 * deterministic, and no randomness is needed. The id is a logical identifier
 * that happens to read as a time, not a clock reading — a second of drift buys
 * a guarantee worth more than the precision it costs.
 */
export function timestampId(prefix: string, taken: Iterable<string>, now: Date): string {
  const seen = new Set(taken);
  const d = new Date(now.getTime());

  for (let i = 0; i < 86_400; i++) {
    const id = `${prefix}-${datePart(d)}-${timePart(d)}`;
    if (!seen.has(id)) return id;
    d.setUTCSeconds(d.getUTCSeconds() + 1);
  }
  // A full day of collisions means `taken` is not what it claims to be.
  throw new Error(`Could not allocate an id for ${prefix}: 86400 consecutive seconds are taken`);
}

/** The id a migrated item takes: its own creation date plus its old number. */
export function migratedId(prefix: string, created: string, oldNumber: number): string {
  // `2026-07-29` -> `26-07-29`
  return `${prefix}-${created.slice(2, 10)}-${String(oldNumber).padStart(3, "0")}`;
}

/**
 * Words dropped from a slug.
 *
 * A slug is a label, not a sentence — `open-issue` says as much as
 * `open-an-issue` in two thirds the space, and space is the whole point.
 *
 * **Negations are deliberately absent from this list.** Dropping `not`, `no`,
 * `never` or `without` inverts the meaning of the title it is naming, which is
 * far worse than a long slug: `blocked-is-not-an-outcome` would become
 * `blocked-outcome`, saying the opposite.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "by", "for",
  "with", "from", "is", "are", "was", "were", "be", "been", "that", "this",
  "as", "into", "it", "its", "we", "our",
]);

/**
 * Abbreviations a reader expands without thinking.
 *
 * Only genuinely conventional ones. An abbreviation the reader has to decode
 * costs more than the characters it saves, and the slug exists to be
 * recognised at a glance.
 */
const ABBREVIATIONS: Record<string, string> = {
  external: "ext",
  repository: "repo",
  repositories: "repos",
  documentation: "docs",
  configuration: "config",
  directory: "dir",
  directories: "dirs",
  environment: "env",
  development: "dev",
  production: "prod",
  specification: "spec",
  implementation: "impl",
  reference: "ref",
  references: "refs",
  database: "db",
  application: "app",
  applications: "apps",
  authentication: "auth",
  package: "pkg",
  packages: "pkgs",
  statistics: "stats",
  information: "info",
  administrator: "admin",
  parameter: "param",
  parameters: "params",
  temporary: "temp",
  previous: "prev",
  number: "num",
  identifier: "id",
  identifiers: "ids",
  management: "mgmt",
  maximum: "max",
  minimum: "min",
};

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
export function slugForFilename(title: string, max: number = SLUG_MAX): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter((w) => !STOP_WORDS.has(w));

  // Everything was a stop word — keep the original words rather than emit
  // nothing, since a slug is optional but an empty one is a bug.
  const kept = words.length ? words : title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

  const out: string[] = [];
  for (const w of kept.slice(0, SLUG_MAX_WORDS)) {
    const next = out.length ? `${out.join("-")}-${w}`.length : w.length;
    if (next > max) break;
    out.push(w);
  }

  // A single first word longer than the cap: truncate it rather than return
  // nothing.
  if (!out.length) return kept[0]?.slice(0, max) ?? "";

  while (out.length > 1 && (STOP_WORDS.has(out.at(-1)!) || DANGLING.has(out.at(-1)!))) out.pop();
  return out.join("-");
}

/**
 * Sanitise a slug supplied by hand.
 *
 * Trusted for *wording* — the caller chose it, so no stop words are dropped and
 * nothing is abbreviated — but not for *shape*: it still has to be a legal
 * filename and git ref component.
 */
export function cleanSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/** `MO-26-08-01-15.26.34-blocked-first-class-outcome.md` */
export function itemFilename(
  id: string,
  title: string,
  max: number = SLUG_MAX,
  chosen?: string,
): string {
  const slug = chosen ? cleanSlug(chosen) : slugForFilename(title, max);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}
