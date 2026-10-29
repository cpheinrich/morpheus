import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { gitSubprocessEnv } from "../git-env.js";

/**
 * Which of a checkout's Codex hooks Codex will actually run.
 *
 * Codex runs a repository's `.codex/hooks.json` only after the user trusts each
 * hook with `/hooks`, records that trust in `~/.codex/config.toml`, and says
 * nothing when it declines. A file that is wired and untrusted therefore looks
 * exactly like one that works — and since the read hook landed, an untrusted
 * one silently drops `context refresh` back to the bare assertion. This module
 * reproduces Codex's trust lookup **read-only** so `doctor` can name each hook
 * that still needs trusting. It never writes Codex's config: trusting a hook is
 * the user's security decision, and the desktop app rewrites that file itself.
 *
 * Reproduced from Codex's source at rust-v0.163.0, 0.164.0-alpha.11.1 and
 * 0.165.0, where these parts are identical, and pinned by tests against hashes
 * Codex itself reported (`codex app-server` `hooks/list`):
 *
 * - **Key**: `<absolute hooks.json path>:<event_label>:<group index>:<handler
 *   index>` (`hooks::hook_key`). The path is the file Codex read, so trust is
 *   per file, not per repository or directory.
 * - **Hash**: `sha256:` over compact, key-sorted JSON of
 *   `{event_name, matcher?, hooks: [normalized handler]}`
 *   (`discovery::hook_hash`, `fingerprint::version_for_toml`).
 * - **Linked worktrees** read hooks from the **main checkout's** `.codex/`
 *   (`loader::root_checkout_hooks_folder_for_dir`), keyed by that path — so one
 *   trust covers every worktree, and a branch's own edits to its hooks reach
 *   Codex only once the main checkout has them.
 */

/** `hooks.json` event keys and the labels trust keys and hashes use. */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "pre_tool_use",
  PermissionRequest: "permission_request",
  PostToolUse: "post_tool_use",
  PreCompact: "pre_compact",
  PostCompact: "post_compact",
  SessionStart: "session_start",
  SessionEnd: "session_end",
  UserPromptSubmit: "user_prompt_submit",
  SubagentStart: "subagent_start",
  SubagentStop: "subagent_stop",
  Stop: "stop",
  Interrupt: "interrupt",
};

/** Events whose matcher Codex discards before hashing (`matcher_pattern_for_event`). */
const MATCHERLESS = new Set(["UserPromptSubmit", "Stop", "Interrupt"]);
/** Events with a 1 s default and 3 s ceiling; every other event defaults to 600 s. */
const SHORT_TIMEOUT = new Set(["SessionEnd", "Interrupt"]);
/** Events that can emit `additionalContext`; elsewhere Codex drops the limit. */
const CONTEXT_LIMIT_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "SubagentStart",
]);
/** Codex's `DEFAULT_HOOK_OUTPUT_TOKEN_LIMIT`; an explicit default hashes as unset. */
const DEFAULT_CONTEXT_LIMIT = 2_500;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isWholeNumber = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

/**
 * The trust hash Codex computes for one command handler, or `null` when this
 * module does not reproduce it — an unknown event, a non-command handler, or a
 * field shape Codex would reject — so the caller reports "unverified" rather
 * than inventing a status.
 *
 * `JSON.stringify` matches `serde_json`'s compact output here: both escape only
 * `"`, `\` and control characters, with the same short forms and lowercase
 * `\u00xx`, and neither escapes `/` or non-ASCII.
 */
export function codexHookHash(
  event: string,
  matcher: unknown,
  handler: unknown,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const label = EVENT_LABELS[event];
  if (!label || !isObject(handler) || handler["type"] !== "command") return null;
  const windows = platform === "win32" && typeof handler["commandWindows"] === "string";
  const command = windows ? handler["commandWindows"] : handler["command"];
  if (typeof command !== "string" || command.trim() === "") return null;
  if (matcher !== undefined && matcher !== null && typeof matcher !== "string") return null;

  const rawTimeout = handler["timeout"];
  if (rawTimeout !== undefined && !isWholeNumber(rawTimeout)) return null;
  const timeout = SHORT_TIMEOUT.has(event)
    ? Math.min(Math.max(rawTimeout ?? 1, 1), 3)
    : Math.max(rawTimeout ?? 600, 1);

  const runsAsync = handler["async"] ?? false;
  if (typeof runsAsync !== "boolean") return null;
  const status = handler["statusMessage"];
  if (status !== undefined && status !== null && typeof status !== "string") return null;
  const limit = handler["additionalContextLimit"];
  if (limit !== undefined && limit !== null && !isWholeNumber(limit)) return null;

  const normalized: Json = { type: "command", command, timeout, async: runsAsync };
  if (typeof status === "string") normalized["statusMessage"] = status;
  if (CONTEXT_LIMIT_EVENTS.has(event) && typeof limit === "number" && limit !== DEFAULT_CONTEXT_LIMIT) {
    normalized["additionalContextLimit"] = limit;
  }
  const identity: Json = { event_name: label, hooks: [normalized] };
  if (typeof matcher === "string" && !MATCHERLESS.has(event)) identity["matcher"] = matcher;

  const digest = createHash("sha256").update(JSON.stringify(sortKeys(identity))).digest("hex");
  return `sha256:${digest}`;
}

export type HookTrust = "trusted" | "modified" | "untrusted" | "disabled" | "unverified";

export interface CodexHook {
  /** `hooks.json` event key, e.g. `PostToolUse`. */
  event: string;
  group: number;
  handler: number;
  /** The `hooks.state` key Codex looks up. */
  key: string;
  hash: string | null;
  command: string | null;
}

export interface TrustedHook extends CodexHook {
  trust: HookTrust;
}

/**
 * Every handler in a parsed `hooks.json`, keyed as Codex keys it. Indices are
 * positional over the raw arrays, as in Codex: a group or handler it skips
 * still consumes its index.
 */
export function listCodexHooks(
  document: unknown,
  sourcePath: string,
  platform: NodeJS.Platform = process.platform,
): { hooks: CodexHook[]; problem?: string } {
  if (!isObject(document) || !isObject(document["hooks"])) {
    return { hooks: [], problem: 'it has no "hooks" object' };
  }
  const hooks: CodexHook[] = [];
  for (const [event, groups] of Object.entries(document["hooks"])) {
    if (!Array.isArray(groups)) continue;
    const label = EVENT_LABELS[event] ?? event;
    groups.forEach((group, groupIndex) => {
      if (!isObject(group) || !Array.isArray(group["hooks"])) return;
      (group["hooks"] as unknown[]).forEach((handler, handlerIndex) => {
        const command = isObject(handler) && typeof handler["command"] === "string" ? handler["command"] : null;
        hooks.push({
          event,
          group: groupIndex,
          handler: handlerIndex,
          key: `${sourcePath}:${label}:${groupIndex}:${handlerIndex}`,
          hash: codexHookHash(event, group["matcher"], handler, platform),
          command,
        });
      });
    });
  }
  return { hooks };
}

interface HookState {
  trustedHash?: string;
  enabled?: boolean;
}

export type CodexState =
  | { kind: "absent" }
  | { kind: "unusable"; path: string; why: string }
  | { kind: "ok"; path: string; hookState: Map<string, HookState>; projects: Map<string, string> };

export function codexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env["CODEX_HOME"] || join(homedir(), ".codex");
}

/**
 * Read `config.toml`'s `hooks.state` and `projects` tables. **Read-only.**
 *
 * A file that cannot be parsed is `unusable`, never an empty state: reading it
 * as "nothing trusted" would tell the user to re-trust hooks that already run,
 * which is the answer-shaped failure `learned.md` warns about.
 */
export async function readCodexState(home: string): Promise<CodexState> {
  const path = join(home, "config.toml");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Codex writes config.toml lazily; a home with no file has trusted nothing.
      return (await isDirectory(home))
        ? { kind: "ok", path, hookState: new Map(), projects: new Map() }
        : { kind: "absent" };
    }
    return { kind: "unusable", path, why: error instanceof Error ? error.message : String(error) };
  }
  let doc: unknown;
  try {
    doc = parseToml(raw);
  } catch (error) {
    return { kind: "unusable", path, why: `it is not valid TOML (${(error as Error).message.split("\n")[0]})` };
  }
  const hookState = new Map<string, HookState>();
  const hooks = isObject(doc) ? doc["hooks"] : undefined;
  const state = isObject(hooks) ? hooks["state"] : undefined;
  if (isObject(state)) {
    for (const [key, entry] of Object.entries(state)) {
      if (!isObject(entry)) continue;
      hookState.set(key, {
        trustedHash: typeof entry["trusted_hash"] === "string" ? entry["trusted_hash"] : undefined,
        enabled: typeof entry["enabled"] === "boolean" ? entry["enabled"] : undefined,
      });
    }
  }
  const projects = new Map<string, string>();
  const table = isObject(doc) ? doc["projects"] : undefined;
  if (isObject(table)) {
    for (const [path, entry] of Object.entries(table)) {
      if (isObject(entry) && typeof entry["trust_level"] === "string") projects.set(path, entry["trust_level"]);
    }
  }
  return { kind: "ok", path, hookState, projects };
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then((s) => s.isDirectory(), () => false);
}

export function trustOf(hook: CodexHook, state: Map<string, HookState>): HookTrust {
  const entry = state.get(hook.key);
  if (entry?.enabled === false) return "disabled";
  if (hook.hash === null) return "unverified";
  if (entry?.trustedHash === undefined) return "untrusted";
  return entry.trustedHash === hook.hash ? "trusted" : "modified";
}

async function git(root: string, args: string[]): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    const { stdout } = await promisify(execFile)("git", args, { cwd: root, timeout: 10_000, env: gitSubprocessEnv() });
    return stdout.trim();
  } catch {
    return null;
  }
}

export interface HooksLocation {
  /** This checkout's root. */
  checkout: string;
  /** The main checkout, where Codex reads hooks and where `/hooks` must be run. */
  main: string;
  linkedWorktree: boolean;
}

/** Where Codex reads this checkout's project hooks from. */
export async function codexHooksLocation(root: string): Promise<HooksLocation> {
  const top = await git(root, ["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  const common = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const checkout = top || root;
  // A main checkout's common dir is `<main>/.git`. Anything else (bare
  // repository, submodule) is left alone: Codex only redirects linked worktrees.
  const main = common && basename(common) === ".git" ? dirname(common) : checkout;
  return { checkout, main, linkedWorktree: main !== checkout };
}

async function readHooksFile(path: string): Promise<{ kind: "absent" } | { kind: "unusable"; why: string } | { kind: "ok"; doc: unknown }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
    return { kind: "unusable", why: (error as Error).message };
  }
  try {
    return { kind: "ok", doc: JSON.parse(raw) };
  } catch (error) {
    return { kind: "unusable", why: `it is not valid JSON (${(error as Error).message})` };
  }
}

export interface CodexTrustReport {
  /** `no-codex`: no Codex home on this machine, so nothing to report. */
  kind: "no-codex" | "no-hooks" | "unknown" | "checked";
  location?: HooksLocation;
  hooksPath?: string;
  /** Why trust could not be determined (`unknown`). */
  why?: string;
  /** Codex's project trust for the checkout; untrusted projects load no hooks at all. */
  projectTrusted?: boolean;
  hooks?: TrustedHook[];
  /** In a linked worktree: this checkout's own hooks differ from what Codex runs. */
  worktreeDiffers?: boolean;
}

/** Codex's project-trust decision for a checkout: its own path, then the main checkout's. */
function projectTrust(projects: Map<string, string>, location: HooksLocation): boolean {
  for (const path of [location.checkout, location.main]) {
    const level = projects.get(path);
    if (level !== undefined) return level === "trusted";
  }
  return false;
}

export async function codexTrustReport(root: string, home: string = codexHome()): Promise<CodexTrustReport> {
  const location = await codexHooksLocation(root);
  // Codex creates a project layer only where the checkout has a `.codex/`
  // directory, even when the hooks themselves come from the main checkout.
  if (!(await isDirectory(join(location.checkout, ".codex")))) return { kind: "no-hooks", location };
  const hooksPath = join(location.main, ".codex", "hooks.json");
  const file = await readHooksFile(hooksPath);
  if (file.kind === "absent") return { kind: "no-hooks", location, hooksPath };
  if (file.kind === "unusable") return { kind: "unknown", location, hooksPath, why: `${hooksPath} — ${file.why}` };
  const listed = listCodexHooks(file.doc, hooksPath);
  if (listed.problem) return { kind: "unknown", location, hooksPath, why: `${hooksPath} — ${listed.problem}` };

  const state = await readCodexState(home);
  if (state.kind === "absent") return { kind: "no-codex", location, hooksPath };
  if (state.kind === "unusable") return { kind: "unknown", location, hooksPath, why: `${state.path} — ${state.why}` };

  let worktreeDiffers: boolean | undefined;
  if (location.linkedWorktree) {
    const own = await readHooksFile(join(location.checkout, ".codex", "hooks.json"));
    const identity = (hooks: CodexHook[]) =>
      hooks.map((h) => `${h.event}:${h.group}:${h.handler}:${h.hash ?? h.command}`).sort().join("\n");
    worktreeDiffers =
      own.kind !== "ok" ||
      identity(listCodexHooks(own.doc, hooksPath).hooks) !== identity(listed.hooks);
  }

  return {
    kind: "checked",
    location,
    hooksPath,
    projectTrusted: projectTrust(state.projects, location),
    hooks: listed.hooks.map((hook) => ({ ...hook, trust: trustOf(hook, state.hookState) })),
    worktreeDiffers,
  };
}

/** A hook as a person scanning `/hooks` would recognise it. */
export function describeHook(hook: CodexHook): string {
  const command = hook.command ?? "";
  const position = hook.group === 0 && hook.handler === 0 ? "" : ` #${hook.group}.${hook.handler}`;
  const what = command.includes("context record-read")
    ? "read hook (context record-read)"
    : command.includes(".morpheus/poll-guard.sh")
      ? "CI poll guard"
      : command.includes(".morpheus/session-start.sh")
        ? "session shim (.morpheus/session-start.sh)"
        : `\`${command.length > 48 ? `${command.slice(0, 47)}…` : command}\``;
  return `${hook.event}${position} ${what}`;
}

export interface TrustFinding {
  severity: "warning";
  check: "codex-trust";
  message: string;
}

/** `doctor` findings for a report; none when every hook Codex reads is trusted. */
export function codexTrustFindings(report: CodexTrustReport): TrustFinding[] {
  const out: TrustFinding[] = [];
  const add = (message: string) => out.push({ severity: "warning", check: "codex-trust", message });
  if (report.kind === "no-codex" || report.kind === "no-hooks") return out;
  if (report.kind === "unknown") {
    add(`Codex hook trust is unknown: could not read ${report.why}.`);
    return out;
  }
  const { location, hooksPath, hooks = [] } = report;
  const main = location!.main;
  const where = location!.linkedWorktree
    ? ` This is a linked worktree: Codex runs the main checkout's ${hooksPath} here, keyed by that path, so trusting it there covers every worktree.`
    : "";

  if (report.worktreeDiffers) {
    add(
      `This worktree's .codex/hooks.json differs from the main checkout's ${hooksPath}, which is the ` +
        "file Codex runs in every worktree of this repository. Hooks changed on this branch reach " +
        "Codex sessions only once the main checkout has them (merge, then fast-forward it).",
    );
  }
  if (!report.projectTrusted) {
    add(
      `Codex does not trust ${main} as a project, so it loads none of ${hooksPath}. Open Codex in ` +
        `${main} and accept the trust prompt, then run /hooks.`,
    );
  }
  const needing = hooks.filter((h) => h.trust === "untrusted" || h.trust === "modified");
  if (needing.length) {
    const list = needing
      .map((h) => `${describeHook(h)}${h.trust === "modified" ? " (changed since it was trusted)" : ""}`)
      .join("; ");
    add(
      `Codex will not run ${needing.length} of ${hooks.length} hook${hooks.length === 1 ? "" : "s"} in ` +
        `${hooksPath}. Open Codex in ${main} and run /hooks; trust: ${list}.${where}`,
    );
  }
  const disabled = hooks.filter((h) => h.trust === "disabled");
  if (disabled.length) {
    add(
      `Codex has ${disabled.length} hook${disabled.length === 1 ? "" : "s"} in ${hooksPath} switched off in /hooks: ` +
        `${disabled.map(describeHook).join("; ")}. Re-enable ${disabled.length === 1 ? "it" : "them"} in /hooks if that was not deliberate.`,
    );
  }
  const unverified = hooks.filter((h) => h.trust === "unverified");
  if (unverified.length) {
    add(
      `Could not verify Codex trust for ${unverified.map(describeHook).join("; ")} in ${hooksPath}: ` +
        "only command hooks on known events are reproduced. Check them in /hooks.",
    );
  }
  return out;
}
