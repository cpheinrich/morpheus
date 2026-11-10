import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { searchStateDirectory } from "./local-state.js";

const DAY_MS = 86_400_000;
const TRACE_DAYS = 30;
const DAILY_TRACE_LIMIT = 1_048_576;
const MAX_CORE_BYTES = 8_192;

export type ContextTransport = "cli" | "mcp";
export type ContextOperation = "search" | "read" | "coverage" | "overview" | "related";
export type ContextOutcome = "ok" | "empty" | "error";

export type SearchEngine = "tantivy" | "ripgrep";
export type Arm = "tantivy-full" | "tantivy-bounded" | "ripgrep-bounded" | "ripgrep-full" | "manual" | "legacy";
export interface SearchRollout { id: string; coreInputs: string[] }
export interface SearchConfig {
  transport?: ContextTransport;
  include: string[];
  exclude: string[];
  rollout?: SearchRollout;
}
export interface ContextArm {
  /** The experiment ID from the manifest. */
  id?: string;
  /** An opaque key shared between assignment and query traces, never the provider ID. */
  session?: string;
  arm: Arm;
  engine: "tantivy";
  startup: "bounded" | "full";
  coreInputs?: string[];
  unavailable?: string;
}

export function providerSessionId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.MORPHEUS_CONTEXT_SESSION_ID || (env.CLAUDECODE === "1" ? env.CLAUDE_CODE_SESSION_ID : undefined)
    || env.CODEX_THREAD_ID || undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid context search settings.");
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item || item.includes("\0"))) {
    throw new Error(`context.search.${label} must be an array of nonempty strings.`);
  }
  return [...new Set(value as string[])];
}

export function isHumanInbox(path: string): boolean {
  return path.startsWith(".agent/inbox-archive/") ||
    /^hq\/team\/(?!README\.md$|members\.md$)[^/]+\.md$/i.test(path);
}

function corePath(path: string): boolean {
  return !isHumanInbox(path) && !/[\\\x00-\x1f\x7f]/.test(path) &&
    /^[\w.][\w./ -]*\.md$/i.test(path) &&
    path.split("/").every(segment => ![".", "..", "", ".git", "node_modules"].includes(segment)) &&
    ![".agent/decisions.md", ".agent/learned.md", "CLAUDE.md", "AGENTS.md"].includes(path);
}

function rolloutConfig(value: unknown): SearchRollout | undefined {
  if (value === undefined) return;
  const raw = object(value);
  const coreInputs = strings(raw.coreInputs, "rollout.coreInputs");
  if (typeof raw.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(raw.id)) {
    throw new Error("context.search.rollout.id must be a short, path-free experiment identifier.");
  }
  if (coreInputs.length === 0 || coreInputs.length > 32 || !coreInputs.every(corePath)) {
    throw new Error("context.search.rollout.coreInputs must name 1–32 safe Markdown files.");
  }
  return { id: raw.id, coreInputs };
}

export function parseSearchConfig(value: unknown): SearchConfig {
  const raw = value === undefined ? {} : object(value);
  if (raw.mode !== undefined && raw.mode !== "tantivy" && raw.mode !== "ripgrep") {
    throw new Error("context.search.mode must be tantivy or ripgrep.");
  }
  if (raw.transport !== undefined && raw.transport !== "cli" && raw.transport !== "mcp") {
    throw new Error("context.search.transport must be cli or mcp.");
  }
  return {
    transport: raw.transport === "cli" ? "cli" : "mcp",
    include: strings(raw.include, "include"),
    exclude: strings(raw.exclude, "exclude"),
    rollout: rolloutConfig(raw.rollout),
  };
}

export async function getSearchConfig(root: string): Promise<SearchConfig> {
  const raw = await readFile(join(root, "morpheus.json"), "utf8");
  const manifest = object(JSON.parse(raw));
  const context = manifest.context === undefined ? {} : object(manifest.context);
  return parseSearchConfig(context.search);
}

async function coreBytes(root: string, paths: readonly string[]): Promise<number> {
  const canonicalRoot = await realpath(root);
  const sizes = await Promise.all(paths.map(async path => {
    const target = join(canonicalRoot, path);
    const stat = await lstat(target);
    if (!stat.isFile() || await realpath(target) !== target) throw new Error("Unsafe core file.");
    return stat.size;
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

function rolloutKey(rollout: string, session: string): Buffer {
  return createHash("sha256").update("morpheus-context-v1\0").update(rollout).update("\0").update(session).digest();
}

export function contextTraceSession(rollout: string, session: string): string {
  return rolloutKey(rollout, session).toString("hex").slice(8, 24);
}

export async function contextArm(root: string, sessionId = providerSessionId(), config?: SearchConfig): Promise<ContextArm> {
  const { rollout } = config ?? await getSearchConfig(root);
  const id = rollout?.id;
  const session = sessionId && sessionId.length <= 512 ? contextTraceSession(id ?? "", sessionId) : undefined;
  const full: ContextArm = { arm: "tantivy-full", engine: "tantivy", startup: "full", id, session };
  if (!rollout) return full;
  if (!session) return { ...full, unavailable: "No provider session ID; using full startup." };
  const size = await coreBytes(root, rollout.coreInputs).catch(() => Infinity);
  if (size <= 0 || size > MAX_CORE_BYTES) {
    return { ...full, unavailable: "Startup core is missing, empty, unsafe, or over 8 KiB; using full startup." };
  }
  return { ...full, arm: "tantivy-bounded", startup: "bounded", coreInputs: rollout.coreInputs };
}

export interface ContextTrace {
  type: "assignment" | "query" | "tool" | "visible" | "session-start" | "prompt" | "warm";
  transport?: ContextTransport;
  operation?: ContextOperation;
  outcome?: ContextOutcome;
  arm: Arm;
  engine: SearchEngine;
  /** Actual engine, when different from the assigned engine. */
  actualEngine?: SearchEngine;
  overrideEngine?: SearchEngine;
  session?: string;
  rollout?: string;
  startup?: "bounded" | "full";
  startupBytes?: number;
  startupTokens?: number;
  queryMs?: number;
  queryStartedAt?: number;
  mcpStartedAt?: number;
  waitMs?: number;
  engineQueryMs?: number;
  buildMs?: number;
  cacheHit?: boolean;
  resultCount?: number;
  returnedTokens?: number;
  budget?: number;
}

async function expireTrace(directory: string, now: Date): Promise<void> {
  const cutoff = new Date(now.valueOf() - (TRACE_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  for (const name of await readdir(directory)) {
    if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) < cutoff) {
      await rm(join(directory, name), { force: true });
    }
  }
}

function traceUsage(event: ContextTrace) {
  return {
    transport: event.transport === "cli" || event.transport === "mcp" ? event.transport : undefined,
    operation: (["search", "read", "coverage", "overview", "related"] as const).includes(event.operation!) ? event.operation : undefined,
    outcome: (["ok", "empty", "error"] as const).includes(event.outcome!) ? event.outcome : undefined,
  };
}

/** Keep this intentionally allowlisted. A caller cannot write text by spreading a result object. */
function traceLine(event: ContextTrace, now: Date): string {
  const numbers = {
    startupBytes: event.startupBytes, startupTokens: event.startupTokens,
    queryMs: event.queryMs, engineQueryMs: event.engineQueryMs, buildMs: event.buildMs, waitMs: event.waitMs,
    queryStartedAt: event.queryStartedAt, mcpStartedAt: event.mcpStartedAt,
    resultCount: event.resultCount, returnedTokens: event.returnedTokens, budget: event.budget,
  };
  const safeNumbers = Object.fromEntries(Object.entries(numbers).filter(([, value]) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0));
  return JSON.stringify({
    version: 1, at: now.toISOString(), type: event.type, arm: event.arm, engine: event.engine,
    actualEngine: event.actualEngine === "tantivy" || event.actualEngine === "ripgrep" ? event.actualEngine : undefined,
    overrideEngine: event.overrideEngine === "tantivy" || event.overrideEngine === "ripgrep" ? event.overrideEngine : undefined,
    session: /^[a-f0-9]{16}$/.test(event.session ?? "") ? event.session : undefined,
    rollout: /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(event.rollout ?? "") ? event.rollout : undefined,
    startup: event.startup === "bounded" || event.startup === "full" ? event.startup : undefined,
    ...traceUsage(event),
    cacheHit: typeof event.cacheHit === "boolean" ? event.cacheHit : undefined,
    ...safeNumbers,
  }) + "\n";
}

/** Keep traces in ignored workspace storage writable from the agent sandbox. */
export async function traceContext(root: string, event: ContextTrace, now = new Date()): Promise<void> {
  try {
    if (!["assignment", "query", "tool", "visible", "session-start", "prompt", "warm"].includes(event.type) ||
        !["tantivy-full", "tantivy-bounded", "ripgrep-bounded", "ripgrep-full", "manual", "legacy"].includes(event.arm) ||
        !["tantivy", "ripgrep"].includes(event.engine)) return;
    const directory = await searchStateDirectory(root, "traces");
    await expireTrace(directory, now);
    const file = join(directory, `${now.toISOString().slice(0, 10)}.jsonl`);
    const flags = constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
    const handle = await open(file, flags, 0o600);
    try {
      const stat = await handle.stat();
      const line = traceLine(event, now);
      if (stat.isFile() && stat.nlink === 1 && stat.size + Buffer.byteLength(line) <= DAILY_TRACE_LIMIT) await handle.appendFile(line);
    } finally {
      await handle.close();
    }
  } catch {
    // Local telemetry must never block search, review, or startup.
  }
}
