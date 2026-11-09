export const CONTEXT_SEARCH_HEADER = "Morpheus context search excerpts";

export function isContextSearchOutput(text: string): boolean {
  return text.split("\n").includes(CONTEXT_SEARCH_HEADER) ||
    text.split("\n").some(line => line.startsWith('{"kind":"morpheus-context-search",'));
}

export const CONTEXT_MCP_PREFIX = "mcp__morpheus_context__";
export const MCP_EXCERPT_BYTES = 7_000;
export const MCP_EXCERPT_LINES = 198;
