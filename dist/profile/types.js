/**
 * Row shapes for `morpheus profile`. One `session` row per transcript (a
 * subagent is its own session with a `parentSessionId`), one `span` row per
 * tool call. Everything here is derived from transcripts already on disk; no
 * field is self-reported by an agent.
 */
export const PHASES = [
    "context",
    "checks",
    "ci-wait",
    "wait",
    "review",
    "git",
    "gh",
    "build",
    "browser",
    "simulator",
    "subagent",
    "read/search",
    "edit",
    "other",
];
export function emptyTokens() {
    return { input: 0, cacheRead: 0, cacheCreation: 0, output: 0, thinking: 0 };
}
export function addTokens(into, from) {
    into.input += from.input;
    into.cacheRead += from.cacheRead;
    into.cacheCreation += from.cacheCreation;
    into.output += from.output;
    into.thinking += from.thinking;
}
export function totalTokens(t) {
    return t.input + t.cacheRead + t.cacheCreation + t.output;
}
//# sourceMappingURL=types.js.map