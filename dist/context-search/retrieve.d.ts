import { type ContextTransport } from "./rollout.js";
import { type ContextKind } from "./sources.js";
interface RetrievalOptions {
    session?: string;
    transport: ContextTransport;
    kinds?: readonly ContextKind[];
    started?: number;
    mcpStartedAt?: number;
}
export declare function retrieveContext(root: string, query: string, budget: number, options: RetrievalOptions): Promise<{
    engine: "tantivy";
    data: import("./engine.js").SearchResult;
    totalQueryMs: number;
}>;
export {};
