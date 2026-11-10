import type { Repair } from "../session/install.js";
export declare const CONTEXT_MCP_COMMAND: {
    command: string;
    args: string[];
};
export declare const CONTEXT_GUIDANCE = "## Morpheus context tools\n\nDiscover live tools at startup/resume/compaction. Use `search_project_context` for project\nrecords, `read_project_record` for citations, and the graph for code structure.\nPass the task checkout and this rule to fresh subagents. If MCP is unavailable, use\n`morpheus context search` in that checkout. See the [setup guide](https://github.com/cpheinrich/morpheus/blob/main/docs/runbooks/context-search.md).\n";
/** Explicit setup for portable, version-controlled project settings. */
export declare function installContextClients(root: string, write: boolean, guidance?: boolean): Promise<Repair[]>;
/** User-scoped registration covers clones and linked worktrees without editing either. */
export declare function installUserContextClients(binary: string, env?: NodeJS.ProcessEnv, home?: string): Promise<Repair[]>;
export declare const CONTEXT_STARTUP_GUIDANCE = "Morpheus context tools: discover the live MCP catalog and inspect morpheus --help for current capabilities. Use get_context_overview and search_project_context once the task is known; read material citations and check_context_coverage. If absent, reload after device registration or check portable setup with morpheus context install --check; use morpheus context search in the actual checkout meanwhile. For each fresh reviewer or subagent, include the task checkout and this MCP lookup in the handoff. A configured server is not proof of a successful call. Remote-control/SSH sessions use their executing host; standalone cloud/mobile chats need a supported authorized repository connector or remote MCP.";
