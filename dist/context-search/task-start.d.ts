/** Only sessions whose prompt hook ran get the task check. Legacy clients retain the read gate. */
export declare function taskContextRefusal(root: string, session?: string | undefined): Promise<string | undefined>;
/** An exact-path read uses the same visible citation as a search result. */
export declare function taskRecord(root: string, session: string | undefined, path: string): Promise<{
    path: string;
    text: string;
} | undefined>;
/** Credit an excerpt only when the hook actually saw matching, current source text. */
export declare function observeTaskContext(root: string, session: string, text: string): Promise<void>;
export declare function taskPrompt(raw: string, locateRoot: (cwd: string) => Promise<string | null>): Promise<string | undefined>;
export declare function runTaskPromptHook(): Promise<number>;
