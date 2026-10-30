export const INSTRUCTION_ANCHORS = [
    {
        name: "wait-ci",
        pattern: /morpheus wait-ci/,
        add: "\"when the next step depends on CI, run `morpheus wait-ci <n>` once — never poll `gh run view` or `gh pr checks`\"",
    },
    {
        name: "wait-ci for workflow runs",
        pattern: /wait-ci --(?:run|workflow)\b/,
        add: "\"for a TestFlight, release or nightly run, `morpheus wait-ci --run <id>` (or `--workflow <file> --branch <b>`)\"",
    },
    {
        name: "break loops",
        pattern: /break loops/i,
        add: "the **Break loops** rule: the same failure twice, or the same poll three times, means stop and change approach",
    },
    {
        name: "focused tests",
        pattern: /focused (?:first|tests)/i,
        add: "the **focused first** testing rule: run the tests for the files you changed; at most one full suite per PR",
    },
    {
        name: "refresh on refusal",
        pattern: /refresh[^.]{0,60}\bonly\b[^.]{0,60}\brefus/i,
        add: "\"**Refresh again only when a gated command refuses**\" in Context freshness",
    },
    {
        name: "simplicity first",
        pattern: /simplicity first/i,
        add: "the **Simplicity first** rule: plan the simplest design that meets the requirements, take one simplification pass before implementing, and add complexity, gates or approvals only when observed behaviour proves the need",
    },
];
/** Emphasis, code spans and wrapping removed, so `**Break\nloops.**` still reads as `Break loops.`. */
export function normalizeInstructions(text) {
    return text.replace(/[*`]/g, "").replace(/\s+/g, " ");
}
export function missingInstructions(text, anchors = INSTRUCTION_ANCHORS) {
    const flat = normalizeInstructions(text);
    return anchors.filter((a) => !a.pattern.test(flat));
}
//# sourceMappingURL=instructions.js.map