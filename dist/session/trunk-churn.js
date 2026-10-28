/**
 * Which dirty-trunk edits are IDE churn rather than anybody's work.
 *
 * Nineteen `wip/trunk-*` rescue drafts were opened across the fleet and none
 * was ever adopted. Most held what an IDE writes by itself: Xcode re-sorting
 * a `project.pbxproj` build-settings dictionary, re-serialising a shared
 * `.xcscheme` from one attribute per line to one element per line, or
 * per-user state that should never have been tracked. Evo opened ten of them
 * in two days, alternating between two such diffs, and each became a human's
 * queue item.
 *
 * So the rescue classifies before it publishes. The rule is deliberately
 * narrow, because a false positive discards somebody's edit while a false
 * negative only opens a draft that ages out (see `RESCUE_MAX_AGE_DAYS`). An
 * edit is churn only when it provably carries nothing:
 *
 * - **user state** — a modified or deleted file at a path that is per-user
 *   IDE state by definition (`xcuserdata/`, `.DS_Store`, JetBrains'
 *   `workspace.xml` and friends). `.vscode/` is *not* here: every file VS Code
 *   keeps there is shared configuration people edit on purpose.
 * - **format only** — a modified Xcode file whose structure is unchanged:
 *   a pbxproj where only whitespace, comments and dictionary key order moved
 *   (arrays keep their order, because build-phase order is behaviour), or an
 *   XML scheme/workspace whose elements and attributes are identical.
 * - **on trunk** — the working tree already holds exactly what trunk now has
 *   for that path (same bytes and mode, or the same structure for the Xcode
 *   formats above), so the fast-forward after the reset restores it.
 *
 * Anything unparseable, oversized, binary-looking, a submodule, or simply not
 * matched is real work and is rescued as before. A checkout whose edits are
 * all churn is reset with a one-line report; one real edit among them and the
 * whole set is rescued as today, churn included, so nothing is split apart.
 */
const ZERO = /^0+$/;
const FILE_MODES = new Set(["100644", "100755", "120000"]);
/** JetBrains documents these as per-user, never to be shared. Everything else in `.idea/` may be. */
const JETBRAINS_USER_FILES = new Set([".idea/workspace.xml", ".idea/usage.statistics.xml", ".idea/tasks.xml"]);
const JETBRAINS_USER_DIRS = [".idea/shelf/", ".idea/dictionaries/"];
/** Per-user IDE state by path alone. A path *segment* must match, so `src/xcuserdata.ts` is not one. */
export function userStatePath(path) {
    const segments = path.split("/");
    if (segments.includes("xcuserdata"))
        return true;
    if (segments.at(-1) === ".DS_Store")
        return true;
    // A nested project's `.idea/` counts the same as the root's.
    const idea = segments.lastIndexOf(".idea");
    if (idea < 0)
        return false;
    const rel = segments.slice(idea).join("/");
    return JETBRAINS_USER_FILES.has(rel) || JETBRAINS_USER_DIRS.some((dir) => rel.startsWith(dir));
}
/** The characters an unquoted OpenStep string may hold; anything else Xcode quotes. */
const UNQUOTED = /[A-Za-z0-9_$+/:.-]+/y;
/** The structured formats whose re-serialisation by Xcode is recognised. */
export function canonicalizerFor(path) {
    if (path.endsWith(".pbxproj"))
        return canonicalPbxproj;
    if (path.endsWith(".xcscheme") || path.endsWith(".xcworkspacedata"))
        return canonicalXml;
    return null;
}
/**
 * An OpenStep property list — the pbxproj format — with whitespace and
 * comments dropped and dictionary keys sorted. Array order is kept: it is
 * meaningful (`buildPhases` runs in that order). Strings keep their exact
 * spelling, quotes included, so `"Evo"` and `Evo` differ: Xcode's quoting is
 * deterministic, and a difference there is not something it does on its own.
 * Returns null for anything it does not fully understand.
 */
export function canonicalPbxproj(text) {
    let i = 0;
    const n = text.length;
    const fail = () => { throw new SyntaxError(`pbxproj parse failed at ${i}`); };
    function skip() {
        for (;;) {
            while (i < n && /\s/.test(text[i]))
                i++;
            if (text.startsWith("/*", i)) {
                const end = text.indexOf("*/", i + 2);
                if (end < 0)
                    fail();
                i = end + 2;
            }
            else if (text.startsWith("//", i)) {
                const end = text.indexOf("\n", i + 2);
                i = end < 0 ? n : end + 1;
            }
            else
                return;
        }
    }
    function string() {
        skip();
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < n && text[j] !== '"')
                j += text[j] === "\\" ? 2 : 1;
            if (j >= n)
                fail();
            const raw = text.slice(i, j + 1);
            i = j + 1;
            return raw;
        }
        if (c === "<") {
            const end = text.indexOf(">", i);
            if (end < 0)
                fail();
            const raw = text.slice(i, end + 1);
            if (!/^<[0-9A-Fa-f\s]*>$/.test(raw))
                fail();
            i = end + 1;
            return raw.replace(/\s+/g, "");
        }
        // Sticky, so a large project file is scanned in place rather than re-sliced per token.
        UNQUOTED.lastIndex = i;
        const m = UNQUOTED.exec(text);
        if (!m)
            fail();
        i += m[0].length;
        return m[0];
    }
    function value(depth) {
        if (depth > 64)
            fail();
        skip();
        const c = text[i];
        if (c === "{") {
            i++;
            const entries = new Map();
            for (;;) {
                skip();
                if (text[i] === "}") {
                    i++;
                    break;
                }
                const key = string();
                skip();
                if (text[i] !== "=")
                    fail();
                i++;
                const v = value(depth + 1);
                skip();
                if (text[i] !== ";")
                    fail();
                i++;
                // A key written twice has no single meaning; refuse rather than guess which wins.
                if (entries.has(key))
                    fail();
                entries.set(key, v);
            }
            return `{${[...entries.keys()].sort().map((k) => `${k}=${entries.get(k)};`).join("")}}`;
        }
        if (c === "(") {
            i++;
            const items = [];
            for (;;) {
                skip();
                if (text[i] === ")") {
                    i++;
                    break;
                }
                items.push(value(depth + 1));
                skip();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                skip();
                if (text[i] !== ")")
                    fail();
            }
            return `(${items.join(",")})`;
        }
        return string();
    }
    try {
        const root = value(0);
        skip();
        return i === n ? root : null;
    }
    catch {
        return null;
    }
}
/**
 * An Xcode XML file (`.xcscheme`, `.xcworkspacedata`) as its sequence of
 * elements, with attributes sorted and whitespace-only text dropped. Xcode
 * writes one attribute per line; other tools write one element per line; both
 * are the same document. Element order, attribute values (raw, entities
 * unexpanded) and any real text are kept. Returns null for anything beyond
 * plain elements, attributes, comments and the XML declaration.
 */
export function canonicalXml(text) {
    const out = [];
    const stack = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const lt = text.indexOf("<", i);
        const chunk = text.slice(i, lt < 0 ? n : lt);
        if (chunk.trim())
            out.push(`text ${JSON.stringify(chunk)}`);
        if (lt < 0)
            break;
        i = lt;
        if (text.startsWith("<?", i)) {
            const end = text.indexOf("?>", i);
            if (end < 0)
                return null;
            out.push(`pi ${text.slice(i + 2, end).trim().replace(/\s+/g, " ")}`);
            i = end + 2;
        }
        else if (text.startsWith("<!--", i)) {
            const end = text.indexOf("-->", i);
            if (end < 0)
                return null;
            out.push(`comment ${JSON.stringify(text.slice(i + 4, end))}`);
            i = end + 3;
        }
        else if (text.startsWith("<!", i)) {
            return null; // DOCTYPE, CDATA: not in Xcode's files, and not worth getting subtly wrong.
        }
        else if (text.startsWith("</", i)) {
            const m = /^<\/([A-Za-z_][\w.:-]*)\s*>/.exec(text.slice(i));
            if (!m || stack.pop() !== m[1])
                return null;
            out.push(`close ${m[1]}`);
            i += m[0].length;
        }
        else {
            const name = /^<([A-Za-z_][\w.:-]*)/.exec(text.slice(i));
            if (!name)
                return null;
            i += name[0].length;
            const attrs = new Map();
            for (;;) {
                const ws = /^\s*/.exec(text.slice(i))[0];
                i += ws.length;
                if (text.startsWith("/>", i)) {
                    out.push(open(name[1], attrs), `close ${name[1]}`);
                    i += 2;
                    break;
                }
                if (text[i] === ">") {
                    out.push(open(name[1], attrs));
                    stack.push(name[1]);
                    i++;
                    break;
                }
                if (!ws)
                    return null;
                const attr = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/.exec(text.slice(i));
                if (!attr || attrs.has(attr[1]))
                    return null;
                attrs.set(attr[1], attr[3] ?? attr[4] ?? "");
                i += attr[0].length;
            }
        }
    }
    return stack.length ? null : out.join("\n");
}
function open(name, attrs) {
    return `open ${name}${[...attrs.keys()].sort().map((k) => ` ${k}=${JSON.stringify(attrs.get(k))}`).join("")}`;
}
/**
 * Classify every changed path. `trunk` is the fetched trunk tip's entry for
 * each path, absent when trunk does not have it. Returns the churn and the
 * paths that are real work; the caller resets only when `real` is empty.
 */
export async function classifyChanges(changes, trunk, read) {
    const churn = [];
    const real = [];
    for (const change of changes) {
        const kind = await classifyOne(change, trunk.get(change.path), read);
        if (kind)
            churn.push({ path: change.path, kind });
        else
            real.push(change.path);
    }
    return { churn, real };
}
async function classifyOne(change, onTrunk, read) {
    const deleted = ZERO.test(change.newBlob) || change.status === "D";
    const existed = !ZERO.test(change.oldBlob) && change.status !== "A";
    // Exactly what trunk has: the fast-forward after the reset puts it back. Regular files and
    // symlinks only — a submodule's checkout is not moved by a reset, so it is never assumed.
    if (deleted ? !onTrunk : onTrunk && FILE_MODES.has(change.newMode) && onTrunk.mode === change.newMode && onTrunk.blob === change.newBlob) {
        return "on-trunk";
    }
    if (existed && (change.status === "M" || change.status === "D") && userStatePath(change.path))
        return "user-state";
    if (change.status !== "M" || !existed || deleted)
        return null;
    if (change.oldMode !== change.newMode || !FILE_MODES.has(change.newMode) || change.newMode === "120000")
        return null;
    const canonical = canonicalizerFor(change.path);
    if (!canonical)
        return null;
    const after = await read(change.newBlob);
    const now = after === null ? null : canonical(after);
    if (now === null)
        return null;
    const before = await read(change.oldBlob);
    if (before !== null && canonical(before) === now)
        return "format-only";
    if (onTrunk && onTrunk.mode === change.newMode) {
        const trunkText = await read(onTrunk.blob);
        if (trunkText !== null && canonical(trunkText) === now)
            return "on-trunk";
    }
    return null;
}
/** Parse `git diff --raw -z --no-renames --no-abbrev`. */
export function parseRawDiff(raw) {
    const out = [];
    const parts = raw.split("\0");
    for (let k = 0; k + 1 < parts.length; k += 2) {
        const meta = parts[k].replace(/^\n/, "");
        const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(meta);
        if (!m)
            return [];
        out.push({ oldMode: m[1], newMode: m[2], oldBlob: m[3], newBlob: m[4], status: m[5], path: parts[k + 1] });
    }
    return out;
}
/** Parse `git ls-tree -r -z`: `<mode> <type> <object>\t<path>`. */
export function parseLsTree(raw) {
    const out = new Map();
    for (const entry of raw.split("\0")) {
        const m = /^(\d{6}) \w+ ([0-9a-f]+)\t([\s\S]+)$/.exec(entry);
        if (m)
            out.set(m[3], { mode: m[1], blob: m[2] });
    }
    return out;
}
const KIND_LABEL = {
    "user-state": "IDE user state",
    "format-only": "formatting only",
    "on-trunk": "already on trunk",
};
/** `2 IDE user state, 1 formatting only: a/b.pbxproj, …` — for the one-line report. */
export function describeChurn(churn) {
    const counts = new Map();
    for (const entry of churn)
        counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    const kinds = [...counts].map(([kind, count]) => `${count} ${KIND_LABEL[kind]}`).join(", ");
    const shown = churn.slice(0, 3).map((entry) => entry.path).join(", ");
    return `${kinds}: ${shown}${churn.length > 3 ? `, … ${churn.length - 3} more` : ""}`;
}
//# sourceMappingURL=trunk-churn.js.map