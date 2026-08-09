/**
 * Targeted edits to an item's YAML frontmatter.
 *
 * Deliberately a text rewrite rather than parse-and-serialise. Round-tripping
 * through a YAML emitter reformats the whole block — quoting style, key order,
 * blank lines — turning a one-field status change into a diff nobody can read,
 * and these files are reviewed as diffs.
 *
 * Scope is one field per line, which is all our frontmatter uses. Anything
 * nested would need a real parser, and nothing here has any.
 */
type FrontmatterValue = string | number | readonly (string | number)[] | null;
/**
 * Set or remove frontmatter fields, preserving everything else byte for byte.
 *
 * A `null` value removes the key — which `pm unblock` needs, since leaving a
 * stale `needs:` on an unblocked item is worse than never having written one:
 * it reads as current.
 *
 * A key that is absent and being set is appended just before the closing `---`,
 * so it lands inside the block rather than in the body.
 *
 * Returns the input unchanged when there is no frontmatter to edit. Throwing
 * would abort a batch over many files for one malformed input, which is the
 * pattern `parse.ts` exists to avoid.
 */
export declare function updateFrontmatter(raw: string, fields: Record<string, FrontmatterValue>): string;
/**
 * Today, in the same fixed zone the ids use.
 *
 * Not `toISOString()`, which is UTC: after 5pm Pacific that is already
 * tomorrow, so an item created at 17:28 got the id `MO-26-08-01-17.28.41` and
 * the frontmatter `created: 2026-08-02`. The whole reason ids pin a zone is
 * that ordering is meaningless when writers measure from different origins, and
 * a date field beside them measuring from a third one gives that up again.
 *
 * The one exception is `schema.ts`, which slices a `Date` js-yaml has *already*
 * parsed as UTC — there, UTC is what makes the round trip lossless.
 */
export { isoDateInZone as today } from "./id.js";
