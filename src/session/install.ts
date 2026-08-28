import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * The session-start hook, as one literal.
 *
 * Claude Code and Codex read the same shape — `hooks.SessionStart[].hooks[]`
 * with a `type` and a `command` — from two different files, so the wiring is
 * one fact expressed twice rather than two designs. Keeping the literal here
 * rather than in `init/templates.ts` puts it beside the protocol it belongs
 * to; the scaffold imports it.
 *
 * Bare `morpheus`, not `pnpm morpheus`: `init` writes no `package.json`, so a
 * scaffolded project has nothing for pnpm to resolve. The self-contained
 * global install puts the reviewed binary on PATH without linking a checkout.
 */
export const SESSION_START_COMMAND = "morpheus context brief";

/** No `matcher`, so it fires on a fresh start, a resume and a clear alike. */
const sessionStartBlock = () => ({
  SessionStart: [{ hooks: [{ type: "command", command: SESSION_START_COMMAND }] }],
});

/**
 * The two files, byte-identical when neither exists yet.
 *
 * That is a coincidence of both tools converging on Claude Code's schema, not
 * a reason to write one file and symlink it: `.claude/settings.json` is a
 * whole settings document that also carries permissions, plugins and a theme,
 * while `.codex/hooks.json` holds hooks and nothing else. They diverge the
 * moment either project sets anything else.
 */
export const claudeSettingsFile = (): string =>
  JSON.stringify({ hooks: sessionStartBlock() }, null, 2) + "\n";

export const codexHooksFile = (): string =>
  JSON.stringify({ hooks: sessionStartBlock() }, null, 2) + "\n";

export const CLAUDE_SETTINGS = ".claude/settings.json";
export const CODEX_HOOKS = ".codex/hooks.json";
export const MANIFEST = "morpheus.json";

/**
 * `present` and `blocked` are the two that matter. Everything else is a
 * write that happened.
 */
export type Outcome = "created" | "updated" | "present" | "blocked";

export interface Repair {
  /** Repository-relative path. */
  target: string;
  outcome: Outcome;
  /** What was done, or why it could not be. Always populated. */
  detail: string;
}

export interface InstallOptions {
  /** `false` inspects and reports without touching the filesystem. */
  write: boolean;
  /** The inbox handle to declare. Looked up from `gh` when omitted. */
  handle?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

type Json = Record<string, unknown>;

type Read =
  | { kind: "absent" }
  | { kind: "unusable"; why: string }
  | { kind: "ok"; value: Json };

/**
 * Read a JSON object, keeping *absent* and *unreadable* apart.
 *
 * Collapsing them is the defect `learned.md` names at four levels: a file that
 * cannot be parsed would be treated as a file that is not there, and the
 * repair for "not there" is to write it — which is how a repair tool deletes a
 * settings file whose only problem was a trailing comma.
 */
async function readJson(path: string): Promise<Read> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "ENOENT") return { kind: "absent" };
    return { kind: "unusable", why: error instanceof Error ? error.message : String(error) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      kind: "unusable",
      why: `it is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "unusable", why: "its top level is not a JSON object" };
  }
  return { kind: "ok", value: parsed as Json };
}

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Does this `SessionStart` array already run the brief?
 *
 * Substring rather than equality, because a project may legitimately spell it
 * `pnpm morpheus context brief` or wrap it in a script. Installing a second
 * copy beside a working one would print the brief twice every session, which
 * reads as a bug in the protocol rather than in this command.
 */
function alreadyWired(entries: unknown[]): boolean {
  return entries.some((entry) => {
    if (!isObject(entry) || !Array.isArray(entry["hooks"])) return false;
    return (entry["hooks"] as unknown[]).some(
      (h) => isObject(h) && typeof h["command"] === "string" && h["command"].includes("context brief"),
    );
  });
}

async function writeJson(path: string, value: Json): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Install the hook into one file, merging rather than replacing.
 *
 * The merge is what makes this different from `init`, whose writer skips any
 * file that exists — correct for a scaffold, and the reason a repo that added
 * `.claude/settings.json` for permissions would never receive the hook at all.
 */
async function ensureHook(
  root: string,
  rel: string,
  template: () => string,
  write: boolean,
): Promise<Repair> {
  const path = join(root, rel);
  const found = await readJson(path);

  if (found.kind === "unusable") {
    return {
      target: rel,
      outcome: "blocked",
      detail: `Left untouched — ${found.why}. Repair the file, then re-run.`,
    };
  }

  if (found.kind === "absent") {
    if (write) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, template(), "utf8");
    }
    return { target: rel, outcome: "created", detail: "Wrote the session-start hook." };
  }

  const doc = found.value;
  const hooks = doc["hooks"];
  if (hooks !== undefined && !isObject(hooks)) {
    return {
      target: rel,
      outcome: "blocked",
      detail: 'Left untouched — its "hooks" key is not an object.',
    };
  }
  const block: Json = isObject(hooks) ? { ...hooks } : {};
  const sessionStart = block["SessionStart"];
  if (sessionStart !== undefined && !Array.isArray(sessionStart)) {
    return {
      target: rel,
      outcome: "blocked",
      detail: 'Left untouched — its "hooks.SessionStart" is not an array.',
    };
  }
  const entries: unknown[] = Array.isArray(sessionStart) ? sessionStart : [];
  if (alreadyWired(entries)) {
    return { target: rel, outcome: "present", detail: "Already runs the brief at session start." };
  }

  block["SessionStart"] = [...entries, sessionStartBlock().SessionStart[0]];
  if (write) await writeJson(path, { ...doc, hooks: block });
  return {
    target: rel,
    outcome: "updated",
    detail:
      entries.length > 0
        ? "Added the brief alongside the SessionStart hooks already there."
        : "Added the session-start hook, keeping the rest of the file.",
  };
}

/** The handle to declare, from the flag or from `gh`. */
async function resolveHandle(root: string, given?: string): Promise<string | null> {
  if (given) return given;
  try {
    const { stdout } = await exec("gh", ["api", "user", "--jq", ".login"], { cwd: root });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Declare the inbox in `morpheus.json`.
 *
 * Without `context.handle` the required set is the three scaffolded records
 * and nothing else, so a session refreshes without ever having opened the file
 * a human replies in — the one record whose whole purpose is to carry an
 * answer back. Seven of eight projects were in exactly that state.
 */
async function ensureHandle(root: string, opts: InstallOptions): Promise<Repair> {
  const path = join(root, MANIFEST);
  const found = await readJson(path);

  if (found.kind === "absent") {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail: "No morpheus.json here — this is not a Morpheus project. Run `morpheus init` first.",
    };
  }
  if (found.kind === "unusable") {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail: `Left untouched — ${found.why}. Repair the file, then re-run.`,
    };
  }

  const doc = found.value;
  const context = doc["context"];
  if (context !== undefined && !isObject(context)) {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail: 'Left untouched — its "context" key is not an object.',
    };
  }
  const block: Json = isObject(context) ? { ...context } : {};
  const declared = block["handle"];
  if (declared !== undefined && typeof declared !== "string") {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail: 'Left untouched — "context.handle" is declared but is not a string.',
    };
  }
  if (typeof declared === "string") {
    return {
      target: MANIFEST,
      outcome: "present",
      detail: `Declares context.handle "${declared}".`,
    };
  }

  const handle = await resolveHandle(root, opts.handle);
  if (!handle) {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail:
        "No handle to declare. Pass --handle <github-handle>, or authenticate with `gh auth login`.",
    };
  }

  // **Verified before it is declared.** A handle whose inbox is absent is
  // ABSENT in the required set, therefore unresolvable, therefore never fresh
  // — and no flag reaches it, so every governed command is refused until
  // somebody works out why. Writing that state to fix a warning would be the
  // repair causing the outage.
  const inbox = `hq/team/${handle}.md`;
  if (!(await exists(join(root, inbox)))) {
    return {
      target: MANIFEST,
      outcome: "blocked",
      detail:
        `Did not declare "${handle}" — ${inbox} does not exist, and a declared record that is ` +
        `missing refuses every governed command permanently. Create the inbox first.`,
    };
  }

  block["handle"] = handle;
  if (opts.write) await writeJson(path, { ...doc, context: block });
  return {
    target: MANIFEST,
    outcome: "updated",
    detail: `Declared context.handle "${handle}", putting ${inbox} in the required set.`,
  };
}

/**
 * Wire this project's session-start hooks and inbox declaration.
 *
 * Returns one `Repair` per target rather than a single verdict: two of the
 * three can be blocked for reasons the other two know nothing about, and a
 * command that collapsed them into "failed" would send someone looking at the
 * wrong file.
 */
export async function installContext(root: string, opts: InstallOptions): Promise<Repair[]> {
  return [
    await ensureHook(root, CLAUDE_SETTINGS, claudeSettingsFile, opts.write),
    await ensureHook(root, CODEX_HOOKS, codexHooksFile, opts.write),
    await ensureHandle(root, opts),
  ];
}
