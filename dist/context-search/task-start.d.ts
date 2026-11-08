import { type ContextOperation } from "./rollout.js";
/** The existing startup hook can arm the check independently of trust for the prompt reminder. */
export declare function armMcpTaskContext(root: string, session: string): Promise<void>;
/** A startup or prompt hook arms the task check when read evidence is active. */
export declare function taskContextRefusal(root: string, session?: string | undefined): Promise<string | undefined>;
/** An exact-path read uses the same visible citation as a search result. */
export declare function taskRecord(root: string, session: string | undefined, path: string): Promise<{
    path: string;
    text: string;
} | undefined>;
/** Credit an excerpt only when the hook actually saw matching, current source text. */
export declare function observeTaskContext(root: string, session: string, text: string, operation?: Extract<ContextOperation, "search" | "read">): Promise<void>;
export declare function taskPrompt(raw: string, locateRoot: (cwd: string) => Promise<string | null>): Promise<string | undefined>;
export declare function runTaskPromptHook(): Promise<number>;
