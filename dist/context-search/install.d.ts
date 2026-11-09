import type { Repair } from "../session/install.js";
export declare const CONTEXT_MCP_COMMAND: {
    command: string;
    args: string[];
};
export declare const CONTEXT_GUIDANCE = "## Morpheus context tools\n\nDiscover live MCP tools at startup/resume/compaction. Use `get_context_overview`,\n`search_project_context`, cited reads and coverage; keep the graph for code structure.\nIf absent, check/repair with `morpheus context install`, reload, and use\n`morpheus context search` meanwhile. Verify checkout/task freshness.\nPhone remote sessions use their host; standalone cloud/mobile needs an authorized connector.\n";
/** Explicit project setup only. Session startup advises; it never rewrites client configuration. */
export declare function installContextClients(root: string, write: boolean, guidance?: boolean): Promise<Repair[]>;
export declare const CONTEXT_STARTUP_GUIDANCE = "Morpheus context tools: discover the live MCP catalog and inspect morpheus --help for current capabilities. Use get_context_overview and search_project_context once the task is known; read material citations and check_context_coverage. If absent, run morpheus context install --check, repair explicit project setup and reload; use morpheus context search in the actual checkout meanwhile. A configured server is not proof of a successful call. Remote-control/SSH sessions use their executing host; standalone cloud/mobile chats need a supported authorized repository connector or remote MCP.";
