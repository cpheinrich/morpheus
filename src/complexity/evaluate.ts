import { extname } from "node:path";
import type { ChangedFile } from "./diff.js";
import { inScope, type ComplexityConfig, type ComplexityException } from "./policy.js";

export interface FunctionRow {
  name: string;
  longName: string;
  start: number;
  end: number;
  ccn: number;
  cognitive: number | null;
  nloc: number;
}

export interface FileResult {
  path: string;
  status: "measured" | "unsupported" | "unmeasured" | "skipped";
  error?: string;
  directives?: { line: number; text: string }[];
  functions?: FunctionRow[];
}

export type Severity = "error" | "warning" | "note";

export interface Finding {
  rule: string;
  severity: Severity;
  path?: string;
  line?: number;
  message: string;
}

/** `all` measures every function in the file; a ChangedFile only the ones its changes touch. */
export type Target = ChangedFile | "all";

export interface Evaluation {
  findings: Finding[];
  targeted: number;
  inTouchedFiles: number;
  measuredFiles: number;
}

const GLOBAL = "*global*";

/** Code outside every function is Lizard's `*global*` row; Evo's baseline scores it too. */
export function isTouched(fn: FunctionRow, target: Target, all: FunctionRow[]): boolean {
  if (target === "all" || target.whole) return true;
  if (fn.name !== GLOBAL) return target.ranges.some(([lo, hi]) => fn.start <= hi && fn.end >= lo);
  const inner = all.filter((f) => f.name !== GLOBAL);
  return target.ranges.some(([lo, hi]) => hasLineOutside(lo, hi, inner));
}

function hasLineOutside(lo: number, hi: number, functions: FunctionRow[]): boolean {
  for (let line = lo; line <= hi; line++) {
    if (!functions.some((f) => f.start <= line && line <= f.end)) return true;
  }
  return false;
}

export type Scope = "changed" | "all";

export function evaluate(config: ComplexityConfig, results: FileResult[], targets: Map<string, Target>, scope: Scope = "changed"): Evaluation {
  const findings: Finding[] = [];
  const evaluation: Evaluation = { findings, targeted: 0, inTouchedFiles: 0, measuredFiles: 0 };
  const unsupported: string[] = [];
  for (const file of results) {
    if (file.status === "unsupported") unsupported.push(file.path);
    else if (file.status === "skipped") findings.push({ rule: "coverage", severity: "note", path: file.path, message: `${file.path} was not read: ${file.error ?? "skipped"}` });
    else if (file.status === "unmeasured") findings.push({ rule: "unmeasured", severity: "error", path: file.path, message: `${file.path} has a language Lizard reads but was not measured (${file.error ?? "unknown"})` });
    else evaluateFile(config, file, targets.get(file.path) ?? "all", evaluation);
  }
  if (unsupported.length) findings.push(coverageNote(unsupported));
  findings.push(...exceptionFindings(config, results, targets, scope));
  return evaluation;
}

function evaluateFile(config: ComplexityConfig, file: FileResult, target: Target, evaluation: Evaluation): void {
  const functions = file.functions ?? [];
  evaluation.measuredFiles += 1;
  evaluation.inTouchedFiles += functions.length;
  for (const directive of file.directives ?? []) {
    evaluation.findings.push({ rule: "directive", severity: "warning", path: file.path, line: directive.line, message: `"${directive.text}" in ${file.path}:${directive.line} would hide code from Lizard; it was neutralised and the file measured in full. Generated files belong in complexity.exclude.` });
  }
  for (const fn of functions) {
    if (!isTouched(fn, target, functions)) continue;
    evaluation.targeted += 1;
    evaluation.findings.push(...functionFindings(config, file.path, fn));
  }
}

function functionFindings(config: ComplexityConfig, path: string, fn: FunctionRow): Finding[] {
  const out: Finding[] = [];
  const line = Math.max(fn.start, 1);
  const label = fn.name === GLOBAL ? "top-level code" : fn.longName;
  const excepted = config.exceptions.some((e) => e.path === path && e.longName === fn.longName);
  if (fn.ccn > config.ccn && !excepted) {
    out.push({ rule: "ccn-over", severity: "error", path, line, message: `${path}:${line} ${label} has CCN ${fn.ccn} (limit ${config.ccn})` });
  }
  if (fn.cognitive !== null && fn.cognitive > config.cognitiveWarn) {
    out.push({ rule: "cognitive-over", severity: "warning", path, line, message: `${path}:${line} ${label} has cognitive complexity ${fn.cognitive} (advisory ${config.cognitiveWarn})` });
  }
  return out;
}

function coverageNote(paths: string[]): Finding {
  const byExtension = new Map<string, number>();
  for (const p of paths) {
    const ext = extname(p) || "(no extension)";
    byExtension.set(ext, (byExtension.get(ext) ?? 0) + 1);
  }
  const summary = [...byExtension].map(([ext, n]) => `${ext}×${n}`).join(", ");
  return { rule: "coverage", severity: "note", message: `${paths.length} file(s) in a language Lizard does not read were not measured: ${summary}` };
}

/**
 * An exception is judged only where its file was analysed in this run; in a
 * targeted run an untouched file's exception is "not evaluated", never stale.
 * A run over every file (`all`) has seen the whole tree, so an exception whose
 * in-scope file is not there (deleted or renamed) is stale: left in place it
 * would silently cover a later file recreated at that path.
 */
export function exceptionFindings(config: ComplexityConfig, results: FileResult[], targets: Map<string, Target>, scope: Scope = "changed"): Finding[] {
  const measured = new Map(results.filter((r) => r.status === "measured").map((r) => [r.path, r.functions ?? []]));
  const findings: Finding[] = [];
  for (const exception of config.exceptions) {
    const functions = measured.get(exception.path);
    if (functions) findings.push(judgeException(config, exception, functions.filter((f) => f.longName === exception.longName)));
    else findings.push(unanalysed(config, exception, targets.has(exception.path), scope));
  }
  return findings;
}

function unanalysed(config: ComplexityConfig, exception: ComplexityException, targeted: boolean, scope: Scope): Finding {
  if (targeted) return stale(exception, "its file was not measured");
  if (scope === "all" && inScope(config, exception.path)) return stale(exception, "its file no longer exists (deleted or renamed); remove or move the exception");
  return note(exception, "not evaluated: its file was not analysed in this run");
}

function judgeException(config: ComplexityConfig, exception: ComplexityException, matches: FunctionRow[]): Finding {
  if (matches.length === 0) return stale(exception, "no function with that longName exists any more");
  if (matches.length > 1) return stale(exception, `${matches.length} functions share that longName; it cannot say which one it covers`);
  const ccn = matches[0]!.ccn;
  if (ccn > exception.ccn) return stale(exception, `measured CCN ${ccn} exceeds the recorded ${exception.ccn}; an exception never covers growth`);
  if (ccn <= config.ccn) return warn(exception, `measured CCN ${ccn} is within the limit; remove the exception`);
  if (ccn < exception.ccn) return warn(exception, `measured CCN ${ccn} is below the recorded ${exception.ccn}; tighten it to ${ccn}`);
  return note(exception, `excepted at CCN ${ccn} (${exception.kind}: ${exception.reason}; ${exception.ref})`);
}

const where = (e: ComplexityException) => `exception ${e.path} ${e.longName}`;
const stale = (e: ComplexityException, why: string): Finding => ({ rule: "stale-exception", severity: "error", path: e.path, message: `${where(e)}: ${why}` });
const warn = (e: ComplexityException, why: string): Finding => ({ rule: "loose-exception", severity: "warning", path: e.path, message: `${where(e)}: ${why}` });
const note = (e: ComplexityException, why: string): Finding => ({ rule: "exception", severity: "note", path: e.path, message: `${where(e)}: ${why}` });

/** Advisory never blocks: its errors are reported as warnings. */
export function applyMode(config: ComplexityConfig, findings: Finding[]): Finding[] {
  if (config.mode === "enforce") return findings;
  return findings.map((f) => (f.severity === "error" ? { ...f, severity: "warning" } : f));
}
