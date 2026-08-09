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
/**
 * Render a YAML scalar, quoting when the value would otherwise be misparsed.
 *
 * Same rule as `new-item.ts`: a colon in a value ("blocked on: the API key")
 * reads as a nested mapping and breaks the file. Arrays stay on one line so a
 * targeted `issues:` edit remains a targeted diff.
 */
function scalar(value) {
    if (typeof value === "number")
        return String(value);
    return /^[\w.\-/]+$/.test(value)
        ? value
        : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function render(value) {
    return Array.isArray(value) ? `[${value.map(scalar).join(", ")}]` : scalar(value);
}
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
export function updateFrontmatter(raw, fields) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!match)
        return raw;
    const block = match[1];
    const lines = block.split(/\r?\n/);
    for (const [key, value] of Object.entries(fields)) {
        const at = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
        if (value === null) {
            if (at !== -1)
                lines.splice(at, 1);
            continue;
        }
        const line = `${key}: ${render(value)}`;
        if (at === -1)
            lines.push(line);
        else
            lines[at] = line;
    }
    return (raw.slice(0, match.index) +
        `---\n${lines.join("\n")}\n---` +
        raw.slice(match.index + match[0].length));
}
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
//# sourceMappingURL=frontmatter.js.map