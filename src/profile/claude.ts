import { classifyTool, truncateCommand } from "./classify.js";
import { activeTime, credible, deriveItem, deriveRepo, type Interval } from "./derive.js";
import {
  addTokens,
  emptyTokens,
  type ModelUsage,
  type ProfileIssue,
  type Role,
  type SessionRow,
  type SpanRow,
  type TokenTotals,
} from "./types.js";

/** What `<session>/subagents/agent-<id>.meta.json` says about a subagent transcript. */
export interface SubagentMeta {
  parentSessionId: string;
  agentId: string;
  agentType?: string | null;
  description?: string | null;
}

export interface ParseOptions {
  file: string;
  subagent?: SubagentMeta;
  /** Registered project paths, so subdirectories attribute to their repository. */
  roots?: string[];
  home?: string;
}

export interface ParsedSession {
  session: SessionRow | null;
  spans: SpanRow[];
  issues: ProfileIssue[];
}

interface Request {
  order: number;
  model: string;
  effort: string | null;
  usage: TokenTotals;
  toolUseIds: string[];
}

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
  at: number;
  messageId: string;
}

/**
 * A tool result saying a person answered a permission prompt by refusing it.
 * The call's duration is the prompt waiting on that person. Current Claude Code
 * writes `toolDenialKind: "user-rejected"`; older versions only the string.
 *
 * Denials by the auto-mode classifier or a permission rule involve nobody, and
 * an *approved* prompt leaves no marker at all, so its wait stays inside the
 * tool's own duration — a known gap, not something this parser can see.
 */
export function humanDenial(line: { toolDenialKind?: unknown; toolUseResult?: unknown }): boolean {
  return line.toolDenialKind === "user-rejected" || line.toolUseResult === "User rejected tool use";
}

const REVIEW = /review/i;

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
function time(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function claudeUsage(usage: unknown): TokenTotals {
  const u = obj(usage) ?? {};
  return {
    input: num(u.input_tokens),
    cacheRead: num(u.cache_read_input_tokens),
    cacheCreation: num(u.cache_creation_input_tokens),
    output: num(u.output_tokens),
    thinking: num(obj(u.output_tokens_details)?.thinking_tokens),
  };
}

/**
 * Streaming parser for one Claude Code transcript. Feed it lines with `push`,
 * then `finish`. Unparseable lines become issues; nothing throws.
 *
 * Claude Code writes one line per content block, so a single API response
 * spans several `assistant` lines sharing `message.id`, each repeating the
 * same `usage`. Usage is therefore counted once per message id — summing per
 * line would double or triple every token figure.
 */
export class ClaudeTranscript {
  private lineNo = 0;
  private readonly issues: ProfileIssue[] = [];
  private readonly timestamps: number[] = [];
  private readonly requests = new Map<string, Request>();
  private readonly toolUses: ToolUse[] = [];
  private readonly results = new Map<string, { at: number; background: boolean; rejected: boolean }>();
  private sessionId: string | null = null;
  private cwds: string[] = [];
  private branches: string[] = [];
  private sidechain = false;
  private cost: number | null = null;

  constructor(private readonly options: ParseOptions) {}

  push(line: string): void {
    this.lineNo++;
    if (line.trim() === "") return;
    let o: Json | null;
    try {
      o = obj(JSON.parse(line));
    } catch {
      this.issue("unparseable JSON");
      return;
    }
    if (!o) {
      this.issue("line is not a JSON object");
      return;
    }
    const type = str(o.type);
    const at = time(o.timestamp);
    if (at !== null && (type === "user" || type === "assistant" || type === "attachment" || type === "system")) {
      this.timestamps.push(at);
    }
    this.sessionId ??= str(o.sessionId);
    const cwd = str(o.cwd);
    if (cwd && this.cwds[this.cwds.length - 1] !== cwd) this.cwds.push(cwd);
    const branch = str(o.gitBranch);
    if (branch && branch !== "HEAD" && this.branches[this.branches.length - 1] !== branch) this.branches.push(branch);
    if (o.isSidechain === true) this.sidechain = true;

    if (type === "assistant") this.assistant(o, at);
    else if (type === "user") this.user(o, at);
    else if (type === "cost-state") this.cost = typeof o.totalCostUSD === "number" ? o.totalCostUSD : this.cost;
  }

  private issue(message: string): void {
    this.issues.push({ file: this.options.file, line: this.lineNo, message });
  }

  private assistant(o: Json, at: number | null): void {
    const message = obj(o.message);
    if (!message) {
      this.issue("assistant line without a message");
      return;
    }
    const id = str(message.id) ?? str(o.requestId) ?? str(o.uuid) ?? `line-${this.lineNo}`;
    let request = this.requests.get(id);
    if (!request) {
      request = {
        order: this.requests.size,
        model: str(message.model) ?? "unknown",
        effort: str(o.effort),
        usage: claudeUsage(message.usage),
        toolUseIds: [],
      };
      this.requests.set(id, request);
    }
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      const b = obj(block);
      if (!b || b.type !== "tool_use") continue;
      const toolId = str(b.id);
      const name = str(b.name);
      if (!toolId || !name || at === null) {
        this.issue("tool_use without id, name or timestamp");
        continue;
      }
      request.toolUseIds.push(toolId);
      this.toolUses.push({ id: toolId, name, input: b.input, at, messageId: id });
    }
  }

  private user(o: Json, at: number | null): void {
    const message = obj(o.message);
    const content = message && Array.isArray(message.content) ? message.content : [];
    const result = obj(o.toolUseResult);
    const background = Boolean(result && (result.backgroundTaskId || result.isAsync === true));
    const rejected = humanDenial(o);
    for (const block of content) {
      const b = obj(block);
      if (!b || b.type !== "tool_result") continue;
      const toolId = str(b.tool_use_id);
      if (toolId && at !== null && !this.results.has(toolId)) this.results.set(toolId, { at, background, rejected });
    }
  }

  finish(): ParsedSession {
    const { file, subagent } = this.options;
    if (!this.sessionId && !subagent) {
      if (this.lineNo > 0) this.issues.push({ file, line: null, message: "no sessionId in any line" });
      return { session: null, spans: [], issues: this.issues };
    }
    const parentSessionId = subagent?.parentSessionId ?? null;
    const sessionId = subagent ? `${subagent.parentSessionId}:${subagent.agentId}` : this.sessionId!;
    const isSidechain = Boolean(subagent) || this.sidechain;
    const agentType = subagent?.agentType ?? null;
    const role: Role = !isSidechain
      ? "main"
      : REVIEW.test(`${agentType ?? ""} ${subagent?.description ?? ""}`)
        ? "reviewer"
        : "subagent";
    const cwd = this.cwds[0] ?? null;
    const repo = deriveRepo(cwd, this.options.roots, this.options.home);
    const branch = this.branches[this.branches.length - 1] ?? null;
    const item = deriveItem(...this.branches, ...this.cwds);

    const real = [...this.requests.values()].filter((r) => r.model !== "<synthetic>").sort((a, b) => a.order - b.order);
    const tokens = emptyTokens();
    const byModel = new Map<string, ModelUsage>();
    for (const r of real) {
      addTokens(tokens, r.usage);
      const key = `${r.model}\u0000${r.effort ?? ""}`;
      let m = byModel.get(key);
      if (!m) byModel.set(key, (m = { model: r.model, effort: r.effort, requests: 0, tokens: emptyTokens() }));
      m.requests++;
      addTokens(m.tokens, r.usage);
    }
    const first = real[0];
    const firstTurnContextTokens = first ? first.usage.input + first.usage.cacheRead + first.usage.cacheCreation : null;

    const spans: SpanRow[] = [];
    const busy: Interval[] = [];
    const waiting: Interval[] = [];
    for (const use of this.toolUses) {
      const result = this.results.get(use.id);
      const durationMs = result ? Math.max(0, result.at - use.at) : null;
      const input = obj(use.input) ?? {};
      const background = Boolean(result?.background || input.run_in_background === true);
      const phase = result?.rejected ? "human-wait" : classifyTool(use.name, use.input);
      if (phase === "human-wait") {
        if (durationMs !== null) waiting.push({ start: use.at, end: use.at + durationMs });
      } else if (credible(durationMs)) {
        busy.push({ start: use.at, end: use.at + durationMs });
      }
      const request = this.requests.get(use.messageId);
      const share = request && request.model !== "<synthetic>" ? request.toolUseIds.length : 0;
      const command = typeof input.command === "string" && use.name === "Bash" ? truncateCommand(input.command) : null;
      spans.push({
        kind: "span",
        provider: "claude",
        sessionId,
        isSidechain,
        role,
        repo,
        tool: use.name,
        phase,
        start: new Date(use.at).toISOString(),
        durationMs,
        command,
        background,
        inputTokens: share ? Math.round((request!.usage.input + request!.usage.cacheRead + request!.usage.cacheCreation) / share) : null,
        outputTokens: share ? Math.round(request!.usage.output / share) : null,
      });
    }

    const sorted = [...this.timestamps].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const session: SessionRow = {
      kind: "session",
      provider: "claude",
      sessionId,
      parentSessionId,
      isSidechain,
      role,
      agentType,
      cwd,
      repo,
      branch,
      item,
      models: unique(real.map((r) => r.model)),
      efforts: unique(real.map((r) => r.effort).filter((e): e is string => e !== null)),
      start: start === undefined ? null : new Date(start).toISOString(),
      end: end === undefined ? null : new Date(end).toISOString(),
      wallMs: start === undefined || end === undefined ? 0 : end - start,
      activeMs: activeTime(sorted, busy, undefined, waiting),
      requests: real.length,
      toolCalls: this.toolUses.length,
      tokens,
      firstTurnContextTokens,
      byModel: [...byModel.values()],
      costUSD: this.cost,
      file,
    };
    return { session, spans, issues: this.issues };
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Convenience for tests and small inputs: parse a whole transcript held in memory. */
export function parseClaudeTranscript(text: string, options: ParseOptions): ParsedSession {
  const t = new ClaudeTranscript(options);
  for (const line of text.split("\n")) t.push(line);
  return t.finish();
}
