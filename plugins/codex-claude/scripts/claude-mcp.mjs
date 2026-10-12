// MCP tools for a Claude Code session that coordinates and delegates to Codex.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { call } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
const server = new McpServer({ name: "claude-codex", version: "0.1.0" });
const session = {
  sessionId: z
    .string()
    .optional()
    .describe(
      "Current Claude session id, as given by the routing hook; never an invented id.",
    ),
};
const run = { runId: z.string().uuid() };
const specs = {
  inspect: [
    "codex.inspect",
    "Read the current executor recommendation, Claude's remaining subscription allowance and the recorded session settings.",
    { ...session, operation: z.enum(["codex", "claude"]).optional() },
  ],
  start: [
    "codex.start",
    "Delegate a bounded task to Codex on this host in the current repository. First inspect; only pass user-authorized handoff content.",
    {
      ...session,
      prompt: z.string().min(1).max(200000),
      replySource: z.enum(["claude", "user"]).optional(),
      replyReason: z.string().optional(),
      cwd: z.string().optional(),
      operation: z.enum(["codex"]).optional(),
      model: z.string().optional(),
      effort: z
        .enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
        .optional(),
      background: z.boolean().default(false),
    },
  ],
  view: [
    "view",
    "Open a read-only live output page on the execution host.",
    run,
  ],
  status: ["status", "Read persisted Codex run status.", run],
  wait: [
    "wait",
    "Wait up to 25 seconds for Codex progress or completion. Renews the owner lease.",
    { ...run, seconds: z.number().min(0).max(30).default(25) },
  ],
  stop: [
    "stop",
    "Stop this run and its owned process group; retain the saved Codex session for resumption.",
    run,
  ],
  override: [
    "codex.override",
    "Set the executor for this Claude session. Off disables delegation for the session; auto restores budget routing.",
    { ...session, executor: z.enum(["auto", "codex", "claude", "off"]) },
  ],
  memories: [
    "codex.memories",
    "Read selected project memory excerpts from the other agent; never write these files.",
    { ...session, owner: z.enum(["claude", "codex"]) },
  ],
};
for (const [name, [method, description, inputSchema]] of Object.entries(specs))
  server.registerTool(
    `codex_${name}`,
    { description, inputSchema },
    async (args) => {
      try {
        // A worker launched by this bridge must never hand its task back.
        if (process.env[delegatedMarker] && name === "start")
          throw new Error("Delegated workers cannot delegate again.");
        if ("sessionId" in inputSchema && !args.sessionId)
          args.sessionId = process.env.CLAUDE_CODE_SESSION_ID;
        return {
          content: [
            { type: "text", text: JSON.stringify(await call(method, args)) },
          ],
        };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  );
await server.connect(new StdioServerTransport());
