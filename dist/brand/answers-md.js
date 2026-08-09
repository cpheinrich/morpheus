import { BrandAnswers, QUESTIONS } from "./questions.js";
/**
 * The answers as a markdown file you can just edit.
 *
 * A sequential prompt is the wrong shape for this work. The answers refer to
 * each other — `never` is written against `feels`, `mission` gets sharper once
 * `primaryAudience` is concrete — and a wizard makes you commit to each one
 * before you can see the next. Editing a file lets you write them in any
 * order, revise three at once, and leave one blank while you think.
 *
 * So the file is the source of truth and the wizard is one way to fill it in.
 * Not a view of some other record: there is exactly one place the answers
 * live, which is what stops the two paths from disagreeing.
 *
 * Questions are anchored by an HTML comment rather than by matching heading
 * text, so rewording a heading to something clearer does not break parsing.
 * The comment is invisible wherever markdown is rendered.
 */
const ANCHOR = (key) => `<!-- morpheus:q ${key} -->`;
const ANCHOR_RE = /^<!--\s*morpheus:q\s+(\S+)\s*-->$/;
const isList = (q) => q.list === true;
function section(q, value) {
    // Strip the wizard's inline instruction; a file has no "enter to skip".
    const heading = q.prompt.replace(/\s*\(enter to skip\)/, "").trim();
    const lines = [ANCHOR(q.key), `## ${heading}`, ""];
    lines.push(`> ${q.why}`);
    if (q.example)
        lines.push(`>`, `> e.g. ${q.example}`);
    lines.push("");
    if (isList(q)) {
        const items = Array.isArray(value) ? value : [];
        lines.push(...(items.length ? items.map((i) => `- ${i}`) : ["- ", "- ", "- "]));
    }
    else {
        lines.push(typeof value === "string" && value ? value : "");
    }
    lines.push("");
    return lines.join("\n");
}
/** Render the editable file, prefilled with whatever is already known. */
export function renderAnswersMd(name, answers) {
    const head = `# ${name} — brand answers

**Edit this file, then run \`morpheus brand build\`.**

This is the source of truth for everything in \`hq/brand/\`. Answer in any order, leave a question
blank while you think about it, and come back — nothing here is a one-shot. Optional questions can
stay empty.

Keep the \`<!-- morpheus:q ... -->\` comments; they are how the file is read, and they are invisible
when the markdown is rendered.

---

`;
    return head + QUESTIONS.map((q) => section(q, answers?.[q.key])).join("\n");
}
/** Split the file into `key -> raw block`, ignoring anything before the first anchor. */
function blocks(text) {
    const found = new Map();
    let current = null;
    for (const line of text.split("\n")) {
        const anchor = ANCHOR_RE.exec(line.trim());
        if (anchor) {
            current = [];
            found.set(anchor[1], current);
            continue;
        }
        if (current)
            current.push(line);
    }
    return found;
}
/**
 * Strip the parts of a block that are not the answer: the heading, the `>`
 * guidance, and the placeholder `- ` bullets left by the template.
 */
function answerLines(block) {
    return block
        .map((l) => l.trimEnd())
        .filter((l) => !l.startsWith("#") && !l.startsWith(">"))
        .filter((l) => l.trim() !== "" && l.trim() !== "-");
}
export function parseAnswersMd(text) {
    const found = blocks(text);
    const issues = [];
    if (found.size === 0) {
        return {
            answers: null,
            issues: [
                "No questions found. The `<!-- morpheus:q ... -->` comments were removed — " +
                    "run `morpheus brand init` to write a fresh file, or restore them.",
            ],
        };
    }
    const raw = {};
    // Keys already reported as blank. Zod will also object that they are
    // undefined, and telling someone twice that they have not answered a
    // question is noise dressed as thoroughness.
    const blank = new Set();
    for (const q of QUESTIONS) {
        const block = found.get(q.key);
        if (!block) {
            issues.push(`${q.key}: question is missing from the file.`);
            continue;
        }
        const lines = answerLines(block);
        if (lines.length === 0) {
            if (!q.optional) {
                issues.push(`${q.prompt} — not answered yet.`);
                blank.add(q.key);
            }
            continue;
        }
        raw[q.key] = isList(q)
            ? lines.map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean)
            : lines.join("\n").trim();
    }
    const parsed = BrandAnswers.safeParse({ references: [], ...raw });
    if (!parsed.success) {
        for (const i of parsed.error.issues) {
            const key = String(i.path[0] ?? "");
            if (blank.has(key))
                continue;
            const q = QUESTIONS.find((x) => x.key === key);
            issues.push(`${q ? q.prompt : key || "(file)"} — ${i.message}`);
        }
    }
    // Report every problem, but only hand back answers that fully validate.
    return { answers: parsed.success && issues.length === 0 ? parsed.data : null, issues };
}
//# sourceMappingURL=answers-md.js.map