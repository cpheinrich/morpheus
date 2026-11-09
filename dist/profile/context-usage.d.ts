import { type SessionRow, type SpanRow } from "./types.js";
export declare function contextUsage(sessions: SessionRow[], spans: SpanRow[]): {
    transport: "cli" | "mcp" | "both";
    sessions: number;
    activeMsP50: number | null;
    requestsP50: number | null;
    tokensP50: number | null;
}[];
