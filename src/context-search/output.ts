export const CONTEXT_SEARCH_HEADER = "Morpheus context search excerpts";

export function isContextSearchOutput(text: string): boolean {
  return text.split("\n").includes(CONTEXT_SEARCH_HEADER) ||
    text.trimStart().startsWith('{"kind":"morpheus-context-search",');
}
