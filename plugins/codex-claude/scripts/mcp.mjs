import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { call } from "../src/client.mjs";
const server = new McpServer({ name: "codex-claude", version: "0.1.0" });
const task = {
  threadId: z.string().describe("Current Codex task id; never an invented id."),
};
const run = { runId: z.string().uuid() };
const specs = {
  inspect: [
    "Read current executor recommendation, subscription allowance and verified task settings.",
    { ...task, operation: z.enum(["codex", "claude"]).optional() },
  ],
  start: [
    "Delegate a bounded task to Claude on this host in the current repository. First inspect; only pass user-authorized handoff content.",
    {
      ...task,
      prompt: z.string().min(1).max(200000),
      replySource: z.enum(["codex", "user"]).optional(),
      replyReason: z.string().optional(),
      cwd: z.string().optional(),
      operation: z.enum(["claude"]).optional(),
      model: z.string().optional(),
      effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
      background: z.boolean().default(false),
    },
  ],
  view: [
    "Open a read-only live output page inside the Codex browser panel on the execution host.",
    run,
  ],
  status: ["Read persisted Claude run status.", run],
  wait: [
    "Wait up to 25 seconds for Claude progress, a question or completion. Renews the owner lease.",
    { ...run, seconds: z.number().min(0).max(30).default(25) },
  ],
  answer: [
    "Answer a live Claude question. Codex may resolve routine clarification only; actual tool permission requires explicit user approval.",
    {
      ...run,
      questionId: z.string(),
      source: z.enum(["codex", "user"]),
      reason: z.string().min(1),
      answers: z.record(z.string(), z.string()).optional(),
      allow: z.boolean().default(true),
    },
  ],
  stop: [
    "Stop this run and its owned process group; retain saved chat for resumption.",
    run,
  ],
  override: [
    "Set the executor for this Codex task. Off disables delegation for the task; auto restores budget routing.",
    { ...task, executor: z.enum(["auto", "codex", "claude", "off"]) },
  ],
  memories: [
    "Read selected project memory excerpts from the other agent; never write these files.",
    { ...task, owner: z.enum(["claude", "codex"]) },
  ],
};
for (const [method, [description, inputSchema]] of Object.entries(specs))
  server.registerTool(
    `claude_${method}`,
    { description, inputSchema },
    async (args) => {
      try {
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
