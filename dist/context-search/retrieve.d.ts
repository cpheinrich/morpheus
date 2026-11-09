import { type ContextTransport, type SearchEngine } from "./rollout.js";
import { type ContextKind } from "./sources.js";
interface RetrievalOptions {
    session?: string;
    transport: ContextTransport;
    kinds?: readonly ContextKind[];
    started?: number;
}
export declare function retrieveContext(root: string, query: string, budget: number, options: RetrievalOptions): Promise<{
    totalQueryMs: number;
    engine: SearchEngine;
    data: import("./engine.js").SearchResult;
    fallback: boolean;
}>;
export {};
