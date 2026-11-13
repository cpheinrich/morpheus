import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ActiveContextIndex } from "./engine.js";
export declare function createContextMcp(cwd: string, mcpStartedAt?: number, indexes?: Map<string, ActiveContextIndex>): McpServer;
export declare function runContextMcp(): Promise<number>;
