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
 * | New | `PREFIX-YYMMDD-HHMMSS` | `MO-260801-152634` |
 * | Legacy | `PREFIX-YYMMDD-NNN` | `MO-260729-045` |
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
 * Three shapes are accepted: `MO-260801-152634` (timestamp), `MO-260729-045`
 * (migrated), and `MO-045` (not yet migrated). The last is kept because the
 * scheme ships before the sweep, and a validator that rejected the current
 * board would turn every project red the moment this landed.
 */
export const ROADMAP_ID = /^[A-Z]{2,4}-(\d{6}-(\d{6}|\d{3})|\d{3,})$/;

/** Just the two dated shapes — what `pm new` now produces. */
export const DATED_ROADMAP_ID = /^[A-Z]{2,4}-\d{6}-(\d{6}|\d{3})$/;

/** Ceiling, not a target — prefer the shortest intelligible slug. */
export const SLUG_MAX = 64;

export interface ParsedId {
  prefix: string;
  /** `YYMMDD` as written in the id. */
  date: string;
  /** `HHMMSS`, or the old integer for a migrated item. */
  tail: string;
  legacy: boolean;
}

export function parseRoadmapId(id: string): ParsedId | null {
  const m = /^([A-Z]{2,4})-(\d{6})-(\d{6}|\d{3})$/.exec(id);
  if (!m) return null;
  return { prefix: m[1]!, date: m[2]!, tail: m[3]!, legacy: m[3]!.length === 3 };
}

/** True for an id migrated from the integer scheme. */
export function isLegacyId(id: string): boolean {
  return parseRoadmapId(id)?.legacy ?? false;
}

const two = (n: number): string => String(n).padStart(2, "0");

/** `YYMMDD` from a Date, in local time — ids read as the day the author had. */
export function datePart(d: Date): string {
  return `${two(d.getFullYear() % 100)}${two(d.getMonth() + 1)}${two(d.getDate())}`;
}

/** `HHMMSS` from a Date, in local time. */
export function timePart(d: Date): string {
  return `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
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
    d.setSeconds(d.getSeconds() + 1);
  }
  // A full day of collisions means `taken` is not what it claims to be.
  throw new Error(`Could not allocate an id for ${prefix}: 86400 consecutive seconds are taken`);
}

/** The id a migrated item takes: its own creation date plus its old number. */
export function migratedId(prefix: string, created: string, oldNumber: number): string {
  const [y, m, d] = created.slice(0, 10).split("-");
  return `${prefix}-${y!.slice(2)}${m}${d}-${String(oldNumber).padStart(3, "0")}`;
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

/** `MO-260801-152634-blocked-is-a-first-class-outcome.md` */
export function itemFilename(id: string, title: string, max: number = SLUG_MAX): string {
  const slug = slugForFilename(title, max);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}
