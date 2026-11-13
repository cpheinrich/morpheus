import { type ActiveContextIndex } from "./engine.js";
/** Build after a managed pull, so new worktrees can start with the refreshed trunk index. */
export declare function warmTrunkContext(cwd: string): Promise<void>;
/** Build in the background when the MCP host starts, before the first search. */
export declare function warmContextMcp(cwd: string, activeFor: (root: string) => ActiveContextIndex): Promise<void>;
