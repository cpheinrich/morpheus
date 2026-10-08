import { classifyCommand, classifyTool, truncateCommand } from "./classify.js";
import { activeTime, credible, deriveItem, deriveRepo, type Interval } from "./derive.js";
import type { ParsedSession } from "./claude.js";
import {
  addTokens,
  emptyTokens,
  type ModelUsage,
  type Phase,
  type ProfileIssue,
  type Role,
  type SessionRow,
  type SpanRow,
  type TokenTotals,
} from "./types.js";

export interface CodexParseOptions {
  file: string;
  roots?: string[];
  home?: string;
}

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * OpenAI reports `input_tokens` inclusive of the cached part; Claude reports
 * them separately. Normalised here to Claude's split so the two providers sum.
 */
export function codexUsage(usage: unknown): TokenTotals {
  const u = obj(usage) ?? {};
  const cached = num(u.cached_input_tokens);
  return {
    input: Math.max(0, num(u.input_tokens) - cached),
    cacheRead: cached,
    cacheCreation: num(u.cache_write_input_tokens),
    output: num(u.output_tokens),
    thinking: num(u.reasoning_output_tokens),
  };
}

/** `{secs, nanos}` as Codex serialises a Rust `Duration`. */
function durationMs(v: unknown): number | null {
  const d = obj(v);
  if (!d || typeof d.secs !== "number") return null;
  return Math.round(d.secs * 1000 + num(d.nanos) / 1e6);
}

function shellCommand(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
  const argv = v as string[];
  // `["/bin/zsh", "-lc", "<script>"]` — the script is the command that matters.
  if (argv.length >= 3 && (argv[1] === "-lc" || argv[1] === "-c")) return argv.slice(2).join(" ");
  return argv.join(" ");
}

const REVIEW = /review/i;

/**
 * Streaming parser for one Codex rollout file. v1 reads what is reliably
 * present in current rollouts: `session_meta`, `turn_context` (model, effort),
 * `token_count` events, and completed items (commands, MCP calls, file
 * changes, collaboration calls). Older rollout formats yield a session row with
 * whatever of those they carry.
 */
export class CodexTranscript {
  private lineNo = 0;
  private readonly issues: ProfileIssue[] = [];
  private readonly timestamps: number[] = [];
  private meta: Json | null = null;
  private model = "unknown";
  private effort: string | null = null;
  private readonly models: string[] = [];
  private readonly efforts: string[] = [];
  private readonly byModel = new Map<string, ModelUsage>();
  private readonly tokens = emptyTokens();
  private lastTotal: number | null = null;
  private requests = 0;
  private firstTurn: number | null = null;
  private readonly spans: Array<Omit<SpanRow, "sessionId" | "isSidechain" | "role" | "repo">> = [];
  private readonly busy: Interval[] = [];
  private turnCwd: string | null = null;

  constructor(private readonly options: CodexParseOptions) {}

  push(line: string): void {
    this.lineNo++;
    if (line.trim() === "") return;
    let o: Json | null;
    try {
      o = obj(JSON.parse(line));
    } catch {
      this.issues.push({ file: this.options.file, line: this.lineNo, message: "unparseable JSON" });
      return;
    }
    if (!o) return;
    const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(at)) this.timestamps.push(at);
    const payload = obj(o.payload) ?? {};
    switch (o.type) {
      case "session_meta":
        // A forked rollout repeats its parent's meta after its own; the first is this thread.
        this.meta ??= payload;
        break;
      case "turn_context":
        this.model = str(payload.model) ?? this.model;
        this.effort = str(payload.effort) ?? str(obj(obj(payload.collaboration_mode)?.settings)?.reasoning_effort) ?? this.effort;
        this.turnCwd ??= str(payload.cwd);
        if (!this.models.includes(this.model)) this.models.push(this.model);
        if (this.effort && !this.efforts.includes(this.effort)) this.efforts.push(this.effort);
        break;
      case "event_msg":
        if (payload.type === "token_count") this.tokenCount(payload);
        else if (payload.type === "item_completed") this.item(payload, Number.isNaN(at) ? null : at);
        break;
    }
  }

  /**
   * `token_count` events repeat: the same cumulative total is re-emitted
   * around tool calls. A response is counted only when the cumulative total
   * moves, and its own `last_token_usage` is what is attributed to the model
   * and effort in force at that moment.
   */
  private tokenCount(payload: Json): void {
    const info = obj(payload.info);
    if (!info) return;
    const total = num(obj(info.total_token_usage)?.total_tokens);
    if (total === this.lastTotal) return;
    this.lastTotal = total;
    const usage = codexUsage(info.last_token_usage);
    this.requests++;
    this.firstTurn ??= usage.input + usage.cacheRead + usage.cacheCreation;
    addTokens(this.tokens, usage);
    const key = `${this.model}\u0000${this.effort ?? ""}`;
    let m = this.byModel.get(key);
    if (!m) this.byModel.set(key, (m = { model: this.model, effort: this.effort, requests: 0, tokens: emptyTokens() }));
    m.requests++;
    addTokens(m.tokens, usage);
  }

  private item(payload: Json, lineAt: number | null): void {
    const item = obj(payload.item);
    if (!item) return;
    const completed = typeof payload.completed_at_ms === "number" ? payload.completed_at_ms : lineAt;
    if (completed === null) return;
    let tool: string;
    let phase: Phase;
    let command: string | null = null;
    let duration: number | null = durationMs(item.duration);
    switch (item.type) {
      case "CommandExecution": {
        const raw = shellCommand(item.command);
        tool = "exec_command";
        phase = raw ? classifyCommand(raw) : "other";
        command = raw ? truncateCommand(raw) : null;
        break;
      }
      case "McpToolCall":
        tool = `mcp__${str(item.server) ?? "unknown"}__${str(item.tool) ?? "unknown"}`;
        phase = classifyTool(tool, null);
        break;
      case "DynamicToolCall":
        tool = `mcp__${str(item.namespace) ?? "dynamic"}__${str(item.tool) ?? "unknown"}`;
        phase = classifyTool(tool, null);
        break;
      case "FileChange":
        tool = "FileChange";
        phase = "edit";
        break;
      case "Extension":
        tool = str(item.kind) === "web.search" ? "WebSearch" : `extension:${str(item.kind) ?? "unknown"}`;
        phase = classifyTool(tool, null);
        duration ??= typeof item.durationMs === "number" ? item.durationMs : null;
        break;
      case "CollabAgentToolCall": {
        const name = str(item.tool) ?? "unknown";
        tool = `collab:${name}`;
        phase = /wait/.test(name) ? "wait" : "subagent";
        if (duration === null && typeof payload.started_at_ms === "number") duration = Math.max(0, completed - payload.started_at_ms);
        break;
      }
      default:
        return;
    }
    const start = duration === null ? completed : completed - duration;
    if (credible(duration)) this.busy.push({ start, end: completed });
    this.spans.push({
      kind: "span",
      provider: "codex",
      tool,
      phase,
      start: new Date(start).toISOString(),
      durationMs: duration,
      command,
      background: false,
      inputTokens: null,
      outputTokens: null,
    });
  }

  finish(): ParsedSession {
    const { file } = this.options;
    const meta = this.meta;
    const id = meta ? str(meta.id) ?? str(meta.session_id) : null;
    if (!meta || !id) {
      if (this.lineNo > 0) this.issues.push({ file, line: null, message: "no session_meta with an id" });
      return { session: null, spans: [], issues: this.issues };
    }
    const source = obj(meta.source);
    const subagent = obj(source?.subagent);
    const spawn = obj(subagent?.thread_spawn);
    const parentSessionId = str(meta.parent_thread_id) ?? str(spawn?.parent_thread_id) ?? null;
    const isSidechain = Boolean(subagent) || meta.thread_source === "subagent";
    const agentType = str(meta.agent_nickname) ?? str(meta.agent_path) ?? str(subagent?.other) ?? (spawn ? "thread_spawn" : null);
    const role: Role = !isSidechain ? "main" : REVIEW.test(`${agentType ?? ""} ${str(meta.agent_path) ?? ""}`) ? "reviewer" : "subagent";
    const cwd = str(meta.cwd) ?? this.turnCwd;
    const repo = deriveRepo(cwd, this.options.roots, this.options.home);
    const branch = str(obj(meta.git)?.branch);
    const sessionId = id;
    const sorted = [...this.timestamps].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const spans: SpanRow[] = this.spans.map((s) => ({ ...s, sessionId, isSidechain, role, repo }));
    const session: SessionRow = {
      kind: "session",
      provider: "codex",
      sessionId,
      parentSessionId,
      isSidechain,
      role,
      agentType,
      cwd,
      repo,
      branch,
      item: deriveItem(branch, cwd),
      models: this.models,
      efforts: this.efforts,
      start: start === undefined ? null : new Date(start).toISOString(),
      end: end === undefined ? null : new Date(end).toISOString(),
      wallMs: start === undefined || end === undefined ? 0 : end - start,
      activeMs: activeTime(sorted, this.busy),
      requests: this.requests,
      toolCalls: spans.length,
      tokens: this.tokens,
      firstTurnContextTokens: this.firstTurn,
      byModel: [...this.byModel.values()],
      costUSD: null,
      file,
    };
    return { session, spans, issues: this.issues };
  }
}

export function parseCodexTranscript(text: string, options: CodexParseOptions): ParsedSession {
  const t = new CodexTranscript(options);
  for (const line of text.split("\n")) t.push(line);
  return t.finish();
}
