export const CONTEXT_SEARCH_HEADER = "Morpheus context search excerpts";
export function isContextSearchOutput(text) {
    return text.split("\n").includes(CONTEXT_SEARCH_HEADER) ||
        text.split("\n").some(line => line.startsWith('{"kind":"morpheus-context-search",'));
}
//# sourceMappingURL=output.js.map