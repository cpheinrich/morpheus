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
 * | New | `PREFIX-YYYY-MM-DD-HH.MM.SS` **in UTC** | `MO-2026-08-01-15.26.34` |
 * | Legacy | `PREFIX-YYYY-MM-DD-NNN` | `MO-2026-07-29-045` |
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
  /^[A-Z]{2,4}-(\d{4}-\d{2}-\d{2}-(\d{2}\.\d{2}\.\d{2}|\d{3})|\d{3,})$/;

/** Just the two dated shapes — what `pm new` now produces. */
export const DATED_ROADMAP_ID = /^[A-Z]{2,4}-\d{4}-\d{2}-\d{2}-(\d{2}\.\d{2}\.\d{2}|\d{3})$/;

/** Ceiling, not a target — prefer the shortest intelligible slug. */
export const SLUG_MAX = 64;

export interface ParsedId {
  prefix: string;
  /** `YYYY-MM-DD` as written in the id. */
  date: string;
  /** `HH.MM.SS`, or the old integer for a migrated item. */
  tail: string;
  legacy: boolean;
}

export function parseRoadmapId(id: string): ParsedId | null {
  const m = /^([A-Z]{2,4})-(\d{4}-\d{2}-\d{2})-(\d{2}\.\d{2}\.\d{2}|\d{3})$/.exec(id);
  if (!m) return null;
  return { prefix: m[1]!, date: m[2]!, tail: m[3]!, legacy: !m[3]!.includes(".") };
}

/** True for an id migrated from the integer scheme. */
export function isLegacyId(id: string): boolean {
  return parseRoadmapId(id)?.legacy ?? false;
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * **Ids are UTC.** Not a detail — the scheme's whole job is ordering, and
 * ordering is meaningless if two authors measure from different origins.
 *
 * In local time, an item written in Tokyo at 09:00 (00:00 UTC) sorts *after*
 * one written in Los Angeles at 18:00 the "previous" day (01:00 UTC), even
 * though it was written first. The moment contributors are not all in one
 * timezone — which is the case MO-054 exists to support — the board silently
 * stops being chronological.
 *
 * It also keeps the id consistent with the file it sits in: `created:` is
 * `toISOString()`, already UTC. The first draft of this used local time, so an
 * item written at 00:30 UTC from Los Angeles read `id: MO-2026-08-01-17.30.00`
 * against `created: 2026-08-02` — two different days in the same frontmatter.
 *
 * The cost is that an id may name a different calendar day than the author's
 * own. That is the right trade: `created:` already had that property, and a
 * globally comparable id is worth more than a locally familiar one.
 */
export function datePart(d: Date): string {
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/**
 * `HH.MM.SS` in UTC — see `datePart`.
 *
 * Dots rather than colons because git **rejects a colon in a branch name**
 * outright, and `pm claim` derives the branch from the id, so every claim would
 * fail. Files containing colons also stage on macOS but cannot be checked out
 * on Windows. Dots say "clock" without either problem.
 */
export function timePart(d: Date): string {
  return `${two(d.getUTCHours())}.${two(d.getUTCMinutes())}.${two(d.getUTCSeconds())}`;
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
  return `${prefix}-${created.slice(0, 10)}-${String(oldNumber).padStart(3, "0")}`;
}

/**
 * A filename slug: lowercase, hyphenated, cut at a **word** boundary.
 *
 * Mid-word truncation produces noise — `project-manageme`, `pm-claim-is-the-`
 * — so the cut falls back to the last hyphen rather than landing wherever the
 * character limit does. Measured across 80 real items, the median title
 * slugifies to 47 characters, so most slugs are shortened; making them read
 * properly costs nothing.
 */
export function slugForFilename(title: string, max: number = SLUG_MAX): string {
  const full = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (full.length <= max) return full;

  const cut = full.slice(0, max);
  const boundary = cut.lastIndexOf("-");
  // Only fall back to the boundary if it leaves something worth reading; a
  // single very long first word is better truncated than reduced to nothing.
  return (boundary > max / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

/** `MO-2026-08-01-15.26.34-blocked-is-a-first-class-outcome.md` */
export function itemFilename(id: string, title: string, max: number = SLUG_MAX): string {
  const slug = slugForFilename(title, max);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}
