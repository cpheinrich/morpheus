import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { readEvidence, sessionTag } from "../session/evidence.js";
import { projectPolicy } from "../session/policy.js";
import { boundTask } from "../session/tasks.js";
import { searchStateDirectory, validSearchSession } from "./local-state.js";
import { CONTEXT_SEARCH_HEADER } from "./output.js";
import { getSearchConfig, providerSessionId } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";

const SEARCH = 'morpheus context search "<task terms>"';
const READ = "morpheus context task-read <indexed-path>";
const PROMPT = "UserPromptSubmit";

function statePath(root: string, session: string, state: "prompt" | "seen"): string {
  return join(root, "local/context-search/startup", sessionTag(session) + "." + state);
}

async function stateExists(root: string, session: string, state: "prompt" | "seen"): Promise<boolean> {
  return (await readFile(statePath(root, session, state), "utf8").catch(() => "")) === "1\n";
}

async function taskRoot(root: string, session: string): Promise<string> {
  return (await boundTask(root, session).catch(() => null))?.root ?? root;
}

/** Only sessions whose prompt hook ran get the task check. Legacy clients retain the read gate. */
export async function taskContextRefusal(root: string, session = providerSessionId()): Promise<string | undefined> {
  if (!validSearchSession(session)) return;
  const { projectRoot } = await import("../session/read-hook.js");
  const checkout = await projectRoot(root);
  if (!checkout || (await projectPolicy(checkout, session)).rollout?.startup !== "bounded") return;
  const active = await taskRoot(checkout, session);
  for (const path of new Set([active, checkout])) {
    if (await pending(path, session) && await readHookLive(path, session)) {
      return `Load context for the task before continuing. In ${path}, run \`${SEARCH}\` and inspect its excerpts, or run \`${READ}\` for a known governing record. If search is empty, refine the query or read a source directly. Then retry this command.`;
    }
  }
}

async function readHookLive(root: string, session: string): Promise<boolean> {
  const tag = sessionTag(session);
  return (await readEvidence(root)).entries.some(entry => entry.kind === "live" && entry.session === tag);
}

async function pending(root: string, session: string): Promise<boolean> {
  return await stateExists(root, session, "prompt") && !await stateExists(root, session, "seen") &&
    (await projectPolicy(root, session)).rollout?.startup === "bounded";
}

async function taskRecords(root: string, session: string | undefined, paths: readonly string[]) {
  const config = await getSearchConfig(root);
  const coverage = await discoverSources(root, config);
  const required = (await projectPolicy(root, session)).requiredInputs ?? [];
  const allowed = paths.filter(path => coverage.included.includes(path) && !required.includes(path) && path !== "AGENTS.md");
  return readContextSources(root, allowed);
}

/** An exact-path read uses the same visible citation as a search result. */
export async function taskRecord(root: string, session: string | undefined, path: string) {
  return (await taskRecords(root, session, [path]))[0];
}

function citedText(text: string): string {
  const header = text.indexOf(CONTEXT_SEARCH_HEADER + "\n");
  if (header >= 0) return text.slice(header + CONTEXT_SEARCH_HEADER.length + 1);
  const json = text.split("\n").find(line => line.startsWith('{"kind":"morpheus-context-search",'));
  if (!json) return "";
  const value: { output?: unknown } = JSON.parse(json);
  return typeof value.output === "string" ? value.output : "";
}

/** Credit an excerpt only when the hook actually saw matching, current source text. */
export async function observeTaskContext(root: string, session: string, text: string): Promise<void> {
  const output = citedText(text);
  if (!output || !validSearchSession(session)) return;
  if (!await pending(root, session)) return;
  const citations = [...output.matchAll(/^([^\n]+\.md):(\d+)-(\d+)\n/gm)];
  if (!citations.length) return;
  const records = await taskRecords(root, session, citations.map(match => match[1]!));
  if (citations.some(match => isCurrentExcerpt(output, match, records))) {
    await writeFile(statePath(root, session, "seen"), "1\n", { mode: 0o600 });
  }
}

function isCurrentExcerpt(output: string, match: RegExpMatchArray, records: readonly { path: string; text: string }[]): boolean {
  const record = records.find(value => value.path === match[1]);
  const from = Number(match[2]);
  const to = Number(match[3]);
  if (!record || from < 1 || to < from || to - from > 99) return false;
  const lines = record.text.replace(/\r?\n$/, "").split(/\r?\n/);
  if (to > lines.length) return false;
  const excerpt = lines.slice(from - 1, to).join("\n");
  if (!excerpt.trim()) return false;
  const returned = output.slice(match.index! + match[0].length);
  return returned === excerpt || returned.startsWith(excerpt + "\n");
}

function promptPayload(raw: string): { cwd: string; session_id: string } | undefined {
  const input = JSON.parse(raw);
  if (input?.hook_event_name !== PROMPT || !validSearchSession(input.session_id)) return;
  if (typeof input.cwd !== "string" || !isAbsolute(input.cwd) || typeof input.prompt !== "string" || !input.prompt.trim()) return;
  return input;
}

export async function taskPrompt(raw: string, locateRoot: (cwd: string) => Promise<string | null>): Promise<string | undefined> {
  const input = promptPayload(raw);
  if (!input) return;
  const session = input.session_id;
  const cwdRoot = await locateRoot(input.cwd);
  if (!cwdRoot) return;
  const root = await taskRoot(cwdRoot, session);
  if (root !== cwdRoot && await stateExists(cwdRoot, session, "seen")) return;
  if ((await projectPolicy(root, session)).rollout?.startup !== "bounded") return;
  await searchStateDirectory(root, "startup");
  const first = await writeFile(statePath(root, session, "prompt"), "1\n", { flag: "wx", mode: 0o600 })
    .then(() => true, error => { if (error.code === "EEXIST") return false; throw error; });
  if (!first) return;
  const prefix = providerSessionId() === session ? "" : `MORPHEUS_CONTEXT_SESSION_ID='${session.replaceAll("'", "'\\''")}' `;
  return `For the first project task, once its scope is clear and before implementation, load task context in ${root} with \`${prefix}${SEARCH}\` (1,000 tokens by default). For a known governing record use \`${prefix}${READ}\`. Read the returned excerpts and open any governing sources they cite. Refine an empty search. Conversational replies can proceed without a lookup.`;
}

export async function runTaskPromptHook(): Promise<number> {
  const { projectRoot } = await import("../session/read-hook.js");
  try {
    const additionalContext = await taskPrompt(readFileSync(0, "utf8"), projectRoot);
    if (additionalContext) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: PROMPT, additionalContext } }));
  } catch {
    // An unsupported prompt payload must not interrupt the conversation.
  }
  return 0;
}
