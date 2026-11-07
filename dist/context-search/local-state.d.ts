import type { SearchEngine } from "./rollout.js";
export declare function searchStateDirectory(root: string, child: "cache" | "traces" | "engines"): Promise<string>;
export declare function validSearchSession(session?: string): session is string;
export declare function sessionEngine(root: string, session?: string): Promise<SearchEngine | undefined>;
export declare function setSessionEngine(root: string, session: string, engine: SearchEngine | "auto"): Promise<void>;
