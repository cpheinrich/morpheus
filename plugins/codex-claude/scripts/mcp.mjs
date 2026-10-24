import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { call } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
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
// Remote pool workers: Paperclip owns each turn's run; these tools journal, observe and
// control it. Conversations persist across bridge restarts; reattach by conversation id.
const conversation = { conversationId: z.string().uuid() };
const poolSpecs = {
  profiles: ["List configured remote pool profiles (provider, host, model, effort, permission) and their capabilities.", {}],
  start: [
    "Start a pool conversation: one bounded task for a registered remote Claude or Codex worker. Only pass user-authorized handoff content.",
    { ...task, profile: z.string(), prompt: z.string().min(1).max(200000) },
  ],
  status: ["Read a pool conversation's current turn, run identities, question, result and progress.", conversation],
  wait: [
    "Wait up to 25 seconds for streamed progress, a question or the end of the turn. Reads the Paperclip run log; never renews the worker lease.",
    { ...conversation, seconds: z.number().min(0).max(30).default(25) },
  ],
  logs: ["Read one page of the turn's Paperclip run log.", { ...conversation, turn: z.number().int().min(1).optional(), offset: z.number().int().min(0).default(0) }],
  answer: [
    "Answer a remote Claude worker's live question. Codex may resolve routine clarification only; tool permission requires the user's actual approval.",
    { ...conversation, ...task, questionId: z.string(), source: z.enum(["codex", "user"]), reason: z.string().min(1), answers: z.record(z.string(), z.string()).optional(), allow: z.boolean().default(true) },
  ],
  followup: [
    "Send the next turn into the same native session after the current turn ended. A needs_input result needs replySource and replyReason.",
    { ...conversation, ...task, prompt: z.string().min(1).max(200000), replySource: z.enum(["codex", "user"]).optional(), replyReason: z.string().optional() },
  ],
  stop: ["Stop the current turn exactly (before launch, or through its runner) and request Paperclip cancellation.", conversation],
  recover: [
    "After a cancelled turn's end is proven (pool.reconcile), release Paperclip's no-replay hold on its committed follow-up through the supported execution reconciliation. Other holds are reported for an operator.",
    { ...conversation, ...task },
  ],
  reattach: [
    "Reattach after a restart: list a task's conversations, or observe one. retry=true resends an unknown submission with the same idempotency key and requires the current Codex task id.",
    { conversationId: z.string().uuid().optional(), threadId: z.string().optional().describe("Current Codex task id; required with retry."), retry: z.boolean().default(false) },
  ],
};
for (const [method, [description, inputSchema]] of Object.entries(poolSpecs))
  server.registerTool(`pool_${method}`, { description, inputSchema }, async (args) => {
    try {
      if (process.env[delegatedMarker] && (["start", "followup", "answer", "recover"].includes(method) || (method === "reattach" && args.retry === true)))
        throw new Error("Delegated workers cannot delegate again.");
      return { content: [{ type: "text", text: JSON.stringify(await call(`pool.${method}`, args)) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  });
for (const [method, [description, inputSchema]] of Object.entries(specs))
  server.registerTool(
    `claude_${method}`,
    { description, inputSchema },
    async (args) => {
      try {
        // A worker launched by this bridge must never hand its task back.
        if (process.env[delegatedMarker] && method === "start")
          throw new Error("Delegated workers cannot delegate again.");
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
