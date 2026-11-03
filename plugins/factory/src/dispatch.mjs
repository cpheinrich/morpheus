// Automatic dispatch: what one user turn hands a worker, how a turn is identified, and which
// paths a native edit tool would write. The bridge decides; these helpers hold no state.
import { stat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

// A prompt starting with this runs in the coordinating session for that turn only.
export const OPT_OUT = "local:";
export const optedOut = (prompt) =>
  typeof prompt === "string" && prompt.trimStart().toLowerCase().startsWith(OPT_OUT);

const PROMPT_LIMIT = 32000;
const SUMMARY_LIMIT = 2000;
const clip = (text, limit) =>
  text.length > limit ? `${text.slice(0, limit)}\n[truncated at ${limit} characters]` : text;

// The worker gets the user's own words and the bridge's last result for this checkout, never
// the coordinator's transcript or instructions; its saved session for the same checkout and
// route carries its own earlier turns. Anything else it needs comes from asking.
export function dispatchHandoff(prompt, previous) {
  const lines = [
    "Automatic Factory dispatch of one user turn. You are the implementer for this turn; the",
    "coordinating session manages you and verifies your result. You did not see the coordinator's",
    "conversation: if the prompt refers to something you cannot find in this repository or your own",
    "earlier turns, ask (AskUserQuestion) or return outcome needs_input with the question instead of guessing.",
    "",
    "User prompt (verbatim):",
    clip(String(prompt ?? ""), PROMPT_LIMIT),
  ];
  const summary = previous?.result?.summary;
  if (typeof summary === "string" && summary.trim())
    lines.push(
      "",
      `Previous Factory result in this checkout (run ${previous.id}, ${previous.state}; it may be stale):`,
      clip(summary.trim(), SUMMARY_LIMIT),
    );
  return lines.join("\n");
}

// A gateway is a credential many worker sessions share; native means this host's own sign-in.
const via = (executor, gateway) =>
  gateway
    ? `the "${gateway}" gateway credential`
    : `this host's native ${executor} sign-in`;
const quote = (text) => (text ? ` ("${clip(String(text).replace(/\s+/g, " "), 300)}")` : "");
const ids = (runs) => runs.map((run) => run.id).join(", ");

// What the coordinator and the user are told about one turn. `systemMessage` is shown to the
// user as written; `additionalContext` instructs the coordinator, which stays the manager.
export function renderDispatch(outcome, { tools, first }) {
  let status;
  let guidance;
  if (outcome.kind === "dispatched") {
    const run = outcome.run;
    status = `Using Factory to delegate this turn to a ${run.executor} worker session (run ${run.id}) through ${via(run.executor, run.gateway)}; this session manages it.`;
    guidance = [
      `The worker received the user's prompt and the previous Factory result for ${run.cwd}, nothing else from this conversation; its own saved session for this checkout and route continues.`,
      `You remain the manager. Do not edit files in ${run.cwd} while the run is active. Call ${tools}_wait with runId ${run.id} until it is terminal or asks a question.`,
      `Answer only a routine, reversible clarification yourself, as the delegation skill describes, and supply missing context from this conversation in that answer. A permission, approval, spending, sending or material product question goes to the user.`,
      `Verify the result against the user's request before reporting it; a worker saying completed is not evidence. To take over, call ${tools}_stop and wait until the run is terminal.`,
    ].join(" ");
  } else if (outcome.kind === "active" || outcome.kind === "waiting") {
    const runs = outcome.runs;
    status =
      outcome.kind === "active"
        ? `Factory did not start a worker for this turn: run ${ids(runs)} is still ${runs.map((r) => r.state).join(", ")}, and this prompt was not sent to it.`
        : `Factory did not start a worker for this turn: run ${ids(runs)} is waiting for input${quote(runs[0].question)}, and this prompt was not sent to it.`;
    guidance =
      outcome.kind === "active"
        ? `Manage the existing run first: ${tools}_status or ${tools}_wait it, answer a pending question only under the delegation skill's rules, or ${tools}_stop it. This prompt is not approval of any pending permission request. Start new work with ${tools}_start once the run is terminal.`
        : `If the user's message answers that question, resume the run with ${tools}_start, passing its runId with replySource user and a replyReason; otherwise ask the user. Never treat this prompt as approval of a permission, spending or sending request it does not explicitly address.`;
  } else if (outcome.kind === "failed") {
    status = `Factory could not delegate this turn: ${outcome.reason}`;
    guidance = [
      `Tell the user plainly that this turn was not delegated and why; do not quietly do the work here instead.`,
      `Next steps: if another delegation was starting or a run was still stopping, retry with ${tools}_start; if a limit or another run's checkout is named, wait for or stop that run first; otherwise ask the user whether to fix the cause or handle the turn in this session.`,
    ].join(" ");
  } else if (outcome.kind === "unknown") {
    status = `Factory did not start a worker for this turn: ${outcome.reason}.`;
    guidance = [
      `Tell the user plainly that this turn was not delegated, and do not do the work in this session instead.`,
      `Check ${tools}_inspect for a worker already running this turn; if there is none and the user still wants it delegated, start one with ${tools}_start.`,
    ].join(" ");
  } else if (outcome.kind === "manual") {
    status = `Factory is on in manual mode for this session: nothing is delegated unless the user asks, so this turn stays here.`;
    guidance = `Delegate only when the user asks, through the delegation skill.`;
  } else {
    status = `Factory is active, but this turn stays in this session: ${outcome.reason}.`;
    guidance = `Handle this turn here, and do not say it was delegated.`;
  }
  const notice = first
    ? ` This is the first reply in a session where Factory automatic dispatch is on: open it with one short sentence telling the user this: ${status}`
    : "";
  return { systemMessage: status, additionalContext: `${status} ${guidance}${notice}` };
}

// SessionStart: what Factory will do with this session's turns right now.
export function readiness(mode, route, primary, failure) {
  if (mode === "manual")
    return "Factory is on in manual mode (experimental): it delegates only when asked.";
  if (failure) return `Factory automatic dispatch is on (experimental) but not ready: ${failure}`;
  const leaves = route && (Boolean(route.gateway) || route.executor !== primary);
  return leaves
    ? `Factory automatic dispatch is on (experimental): new turns go to a ${route.executor} worker session through ${via(route.executor, route.gateway?.name)}, managed by this session.`
    : `Factory automatic dispatch is on (experimental): new turns stay in this session for now (${route?.reason ?? "no route"}).`;
}

// Codex names the turn. Claude does not, so its identity is the prompt plus the transcript's
// size and modification time: a retried or duplicated hook of one turn sees the same file, and
// a later turn with the same words sees a longer one. Unreadable metadata is no identity, and
// no identity means no automatic launch.
export async function claudeTurnKey(prompt, transcriptPath) {
  if (typeof prompt !== "string" || typeof transcriptPath !== "string" || !transcriptPath)
    return null;
  let info;
  try {
    info = await stat(transcriptPath);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  return `claude:${createHash("sha256")
    .update(JSON.stringify([prompt, transcriptPath, info.size, info.mtimeMs]))
    .digest("hex")
    .slice(0, 32)}`;
}
export const codexTurnKey = (turnId) =>
  typeof turnId === "string" && turnId ? `codex:${turnId}` : null;

// File paths a native edit tool call would write, or null when the call is not one this guard
// knows. Shell commands are deliberately not parsed: the guard prevents an accidental race with
// the coordinator's own worker, it is not a sandbox.
export function editTargets(tool, input, cwd) {
  const base = typeof cwd === "string" && cwd ? cwd : process.cwd();
  const at = (p) => (isAbsolute(p) ? p : resolve(base, p));
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const path = input?.file_path ?? input?.notebook_path;
    return typeof path === "string" && path ? [at(path)] : null;
  }
  if (tool === "apply_patch") {
    const raw = typeof input === "string" ? input : input?.command ?? input?.patch ?? input?.input;
    const text = Array.isArray(raw) ? raw.join("\n") : raw;
    if (typeof text !== "string") return null;
    const paths = [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) =>
      at(m[1].trim()),
    );
    return paths.length ? paths : null;
  }
  return null;
}

// Resolves symlinks in the deepest existing ancestor, so a new file in /tmp compares with a
// checkout recorded under /private/tmp.
export async function canonical(path) {
  const missing = [];
  let current = path;
  while (true) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(basename(current));
      current = parent;
    }
  }
}
export function within(path, directory) {
  const rel = relative(directory, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
