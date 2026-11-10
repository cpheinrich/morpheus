import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { percentile } from "../profile/derive.js";
import { evidenceCheckouts } from "../session/certify.js";
import { checkoutIdentity } from "../session/start.js";
import { ContextPipeline } from "./trace-pipeline.js";

const ARMS = ["tantivy-compact", "tantivy-full", "tantivy-bounded", "ripgrep-bounded", "ripgrep-full", "manual", "legacy"] as const;
const ENGINES = ["tantivy", "ripgrep"] as const;
const OPERATIONS = ["search", "read", "coverage", "overview", "related"] as const;
const TYPES = ["assignment", "query", "tool", "visible", "session-start", "prompt", "warm"] as const;
const OUTCOMES = ["ok", "empty", "error"] as const;
const MAX_TRACE_BYTES = 1_048_576;
const TRACE_FILENAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const WORKTREE_TRACES = "local/context-search/traces";

type Arm = typeof ARMS[number];
type Engine = typeof ENGINES[number];
type Operation = typeof OPERATIONS[number];
type Transport = "cli" | "mcp" | "unknown";
export type Trace = {
  at: number;
  type: typeof TYPES[number];
  arm: Arm;
  engine: Engine;
  actualEngine?: Engine;
  overrideEngine?: Engine;
  rollout: string | null;
  session: string | null;
  transport: Transport;
  operation?: Operation;
  durationMs?: number;
  queryStartedAt?: number;
  mcpStartedAt?: number;
  waitMs?: number;
  engineQueryMs?: number;
  buildMs?: number;
  cacheHit?: boolean;
  returnedTokens?: number;
  outcome?: typeof OUTCOMES[number];
};

type Cohort = { rollout: string | null; arm: Arm; sessions: Set<string>; unattributed: number };
type Activity = {
  rollout: string | null;
  arm: Arm;
  transport: Transport;
  sessions: Set<string>;
  visibleSessions: Set<string>;
  visible: number;
  metrics: Map<Operation, OperationMetrics>;
  engines: Map<Engine, EngineMetrics>;
  fallbacks: number;
  overrides: number;
};

type OperationMetrics = {
  calls: number;
  empty: number;
  errors: number;
  durations: number[];
  tokens: number[];
};

type EngineMetrics = OperationMetrics & { engineDurations: number[]; builds: number[]; cacheHits: number };

function member<const T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find(item => item === value);
}

function nonnegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function identifier(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function traceTransport(value: unknown, type: Trace["type"]): Transport {
  return member(["cli", "mcp"], value) ?? (type === "query" && value === undefined ? "cli" : "unknown");
}

function traceRow(line: string): Trace | undefined {
  let value: Record<string, unknown> | null;
  try { value = JSON.parse(line); } catch { return; }
  if (value?.version !== 1 || typeof value.at !== "string") return;
  const at = Date.parse(value.at);
  const type = member(TYPES, value.type);
  const arm = member(ARMS, value.arm);
  const engine = member(ENGINES, value.engine);
  if (!Number.isFinite(at) || !type || !arm || !engine) return;
  const operation = member(OPERATIONS, value.operation);
  const resultCount = nonnegative(value.resultCount);
  const outcome = member(OUTCOMES, value.outcome);
  return {
    at, type, arm, engine,
    actualEngine: member(ENGINES, value.actualEngine),
    overrideEngine: member(ENGINES, value.overrideEngine),
    rollout: identifier(value.rollout, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
    session: identifier(value.session, /^[a-f0-9]{16}$/),
    transport: traceTransport(value.transport, type),
    operation: operation ?? (type === "query" ? "search" : undefined),
    durationMs: nonnegative(value.queryMs),
    queryStartedAt: nonnegative(value.queryStartedAt),
    mcpStartedAt: nonnegative(value.mcpStartedAt),
    waitMs: nonnegative(value.waitMs),
    engineQueryMs: nonnegative(value.engineQueryMs),
    buildMs: nonnegative(value.buildMs),
    cacheHit: typeof value.cacheHit === "boolean" ? value.cacheHit : undefined,
    returnedTokens: nonnegative(value.returnedTokens),
    outcome: outcome ?? (resultCount === 0 ? "empty" : undefined),
  };
}

async function directoryEntries(directory: string) {
  try {
    if (await realpath(directory) !== directory) return [];
    return await readdir(directory, { withFileTypes: true });
  } catch {
    // Most checkouts predate the pilot or do not have any traces.
    return [];
  }
}

async function traceFiles(cwd: string, since?: string): Promise<string[]> {
  const { root, common } = await checkoutIdentity(cwd);
  const archive = join(common, "morpheus-context-archives");
  const archives = await directoryEntries(archive);
  const locations = [
    ...(await evidenceCheckouts(root)).map(checkout => join(checkout, WORKTREE_TRACES)),
    join(common, "morpheus-context-traces"),
    ...archives.filter(entry => entry.isDirectory()).map(entry => join(archive, entry.name, "context-search/traces")),
  ];
  const paths = await Promise.all(locations.map(async directory =>
    (await directoryEntries(directory))
      .filter(entry => entry.isFile() && TRACE_FILENAME.test(entry.name) && (!since || entry.name.slice(0, 10) >= since))
      .map(entry => join(directory, entry.name))));
  return [...new Set(paths.flat())].sort();
}

async function readTraceFile(path: string): Promise<string | null> {
  const flags = constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(path, flags).catch(() => null);
  if (!handle) return null;
  try {
    const stat = await handle.stat();
    return stat.isFile() && stat.size <= MAX_TRACE_BYTES ? await handle.readFile("utf8") : null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

function observeCohort(cohorts: Map<string, Cohort>, key: string, trace: Trace): void {
  let row = cohorts.get(key);
  if (!row) {
    row = { rollout: trace.rollout, arm: trace.arm, sessions: new Set(), unattributed: 0 };
    cohorts.set(key, row);
  }
  if (trace.session) row.sessions.add(trace.session);
  else row.unattributed++;
}

function emptyMetrics(): OperationMetrics {
  return { calls: 0, empty: 0, errors: 0, durations: [], tokens: [] };
}

function observeMetrics(metric: OperationMetrics, trace: Trace): void {
  metric.calls++;
  if (trace.outcome === "empty") metric.empty++;
  if (trace.outcome === "error") metric.errors++;
  if (trace.durationMs !== undefined) metric.durations.push(trace.durationMs);
  if (trace.returnedTokens !== undefined) metric.tokens.push(trace.returnedTokens);
}

function observeEngine(row: Activity, trace: Trace): void {
  const actual = trace.actualEngine ?? trace.engine;
  const expected = trace.overrideEngine ?? trace.engine;
  let metric = row.engines.get(actual);
  if (!metric) {
    metric = { ...emptyMetrics(), engineDurations: [], builds: [], cacheHits: 0 };
    row.engines.set(actual, metric);
  }
  observeMetrics(metric, trace);
  if (trace.engineQueryMs !== undefined) metric.engineDurations.push(trace.engineQueryMs);
  if (trace.buildMs !== undefined && trace.buildMs > 0) metric.builds.push(trace.buildMs);
  if (trace.cacheHit === true) metric.cacheHits++;
  if (actual !== expected) row.fallbacks++;
  if (trace.overrideEngine !== undefined) row.overrides++;
}

function observeOperation(row: Activity, trace: Trace): void {
  if (!trace.operation) return;
  let metric = row.metrics.get(trace.operation);
  if (!metric) {
    metric = emptyMetrics();
    row.metrics.set(trace.operation, metric);
  }
  observeMetrics(metric, trace);
  if (trace.operation === "search") observeEngine(row, trace);
}

function observeActivity(activity: Map<string, Activity>, key: string, trace: Trace): void {
  const group = `${key}/${trace.transport}`;
  let row = activity.get(group);
  if (!row) {
    row = {
      rollout: trace.rollout, arm: trace.arm, transport: trace.transport, sessions: new Set(),
      visibleSessions: new Set(), visible: 0, metrics: new Map(), engines: new Map(),
      fallbacks: 0, overrides: 0,
    };
    activity.set(group, row);
  }
  if (trace.type === "visible") {
    row.visible++;
    if (trace.session) row.visibleSessions.add(trace.session);
    return;
  }
  if (trace.session) row.sessions.add(trace.session);
  observeOperation(row, trace);
}

function sinceTime(since?: string): number {
  if (!since) return -Infinity;
  const value = Date.parse(since);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== since) {
    throw new Error("Context trace --since must be a UTC date in YYYY-MM-DD format.");
  }
  return value;
}

function formatMetrics(metric: OperationMetrics) {
  return {
    calls: metric.calls,
    empty: metric.empty,
    errors: metric.errors,
    latencySamples: metric.durations.length,
    p50Ms: percentile(metric.durations, 50),
    p95Ms: percentile(metric.durations, 95),
    returnedTokens: metric.tokens.reduce((total, count) => total + count, 0),
    tokenSamples: metric.tokens.length,
    p50ReturnedTokens: percentile(metric.tokens, 50),
  };
}

function formatActivity(row: Activity) {
  const { sessions, visibleSessions, metrics, engines, ...group } = row;
  return {
    ...group,
    sessions: sessions.size,
    visibleSessions: visibleSessions.size,
    operations: Object.fromEntries([...metrics.entries()].sort().map(([operation, metric]) => [operation, formatMetrics(metric)])),
    searchByActualEngine: Object.fromEntries([...engines.entries()].sort().map(([engine, metric]) => [engine, {
      ...formatMetrics(metric),
      p50EngineMs: percentile(metric.engineDurations, 50),
      p95EngineMs: percentile(metric.engineDurations, 95),
      builds: metric.builds.length,
      p50BuildMs: percentile(metric.builds, 50),
      cacheHits: metric.cacheHits,
    }])),
  };
}

/** Aggregate workspace, legacy and archived traces without emitting any per-session values. */
export async function summarizeContextTraces(root: string, options: { since?: string } = {}) {
  const after = sinceTime(options.since);
  const files = await traceFiles(root, options.since);
  const seen = new Set<string>();
  const cohorts = new Map<string, Cohort>();
  const activity = new Map<string, Activity>();
  const pipeline = new ContextPipeline();
  let skippedFiles = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  for (const file of files) {
    const text = await readTraceFile(file);
    if (text === null) {
      skippedFiles++;
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const trace = traceRow(line);
      if (!trace) {
        invalidRows++;
        continue;
      }
      if (trace.at < after) continue;
      const digest = createHash("sha256").update(line).digest("hex");
      if (seen.has(digest)) {
        duplicateRows++;
        continue;
      }
      seen.add(digest);
      const key = `${trace.rollout ?? ""}/${trace.arm}`;
      pipeline.observe(trace);
      if (trace.type === "assignment") observeCohort(cohorts, key, trace);
      if (trace.type === "query" || trace.type === "tool" || trace.type === "visible") observeActivity(activity, key, trace);
    }
  }
  return {
    since: options.since ?? null,
    files: files.length,
    skippedFiles,
    invalidRows,
    duplicateRows,
    assignments: [...cohorts.entries()].sort().map(([, { sessions, ...cohort }]) => ({ ...cohort, sessions: sessions.size })),
    byArmTransport: [...activity.entries()].sort().map(([, row]) => formatActivity(row)),
    pipeline: await pipeline.report(),
  };
}
