import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function createContextMcp(cwd: string, mcpStartedAt?: number): McpServer;
export declare function runContextMcp(): Promise<number>;
