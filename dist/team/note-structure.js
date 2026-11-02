export const PRIORITY_FIRST_SECTIONS = [
    "Executive summary",
    "Key decisions",
    "Key action items",
];
/** Find level-two headings without mistaking examples in fenced code for note structure. */
function levelTwoHeadings(body) {
    const headings = [];
    const lines = body.split(/\r?\n/);
    let fence;
    for (const [index, line] of lines.entries()) {
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
            const character = marker[0];
            if (!fence) {
                fence = { character, length: marker.length };
            }
            else if (character === fence.character &&
                marker.length >= fence.length &&
                new RegExp(`^ {0,3}\\${character}{${fence.length},}\\s*$`).test(line)) {
                fence = undefined;
            }
            continue;
        }
        if (fence)
            continue;
        const match = /^ {0,3}##(?!#)\s+(.+?)\s*#*\s*$/.exec(line);
        if (match)
            headings.push({ title: match[1], line: index });
    }
    return headings;
}
function hasSectionContent(lines, start, end) {
    let fence;
    let inComment = false;
    for (const line of lines.slice(start, end)) {
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
            const character = marker[0];
            if (!fence) {
                fence = { character, length: marker.length };
            }
            else if (character === fence.character &&
                marker.length >= fence.length &&
                new RegExp(`^ {0,3}\\${character}{${fence.length},}\\s*$`).test(line)) {
                fence = undefined;
            }
            continue;
        }
        if (fence)
            continue;
        let visible = line;
        while (visible.length > 0) {
            if (inComment) {
                const endComment = visible.indexOf("-->");
                if (endComment < 0) {
                    visible = "";
                    break;
                }
                visible = visible.slice(endComment + 3);
                inComment = false;
            }
            const startComment = visible.indexOf("<!--");
            if (startComment < 0)
                break;
            const endComment = visible.indexOf("-->", startComment + 4);
            if (endComment < 0) {
                visible = visible.slice(0, startComment);
                inComment = true;
                break;
            }
            visible = visible.slice(0, startComment) + visible.slice(endComment + 3);
        }
        const rendered = visible
            .trim()
            .replace(/^>+\s*/, "")
            .replace(/^(?:[-+*]|\d+[.)])\s*/, "")
            .replace(/^\[[ xX]\]\s*/, "")
            .trim();
        if (rendered.length > 0 &&
            !/^#{1,6}(?:\s|$)/.test(rendered) &&
            !/^(?:-{3,}|_{3,}|\*{3,})$/.test(rendered)) {
            return true;
        }
    }
    return false;
}
/** Validate only formats a note explicitly claims; unversioned historical notes stay readable. */
export function validateMeetingNoteBody(note, body) {
    if (note.note_format !== "priority-first-v1")
        return [];
    const headings = levelTwoHeadings(body);
    const issues = [];
    for (const [index, expected] of PRIORITY_FIRST_SECTIONS.entries()) {
        const actual = headings[index];
        if (actual?.title !== expected) {
            issues.push(`note_format priority-first-v1 requires section ${index + 1} to be "${expected}"` +
                (actual ? `, found "${actual.title}"` : ", but it is missing"));
            continue;
        }
        const lines = body.split(/\r?\n/);
        const next = headings[index + 1]?.line ?? lines.length;
        if (!hasSectionContent(lines, actual.line + 1, next)) {
            issues.push(`section "${expected}" must contain a summary, bullets, or "None recorded."`);
        }
    }
    return issues;
}
//# sourceMappingURL=note-structure.js.map