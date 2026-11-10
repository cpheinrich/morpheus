export declare function searchStateDirectory(root: string, child: "cache" | "traces" | "startup"): Promise<string>;
export declare function validSearchSession(session?: string): session is string;
