import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { evidenceCheckouts, evidenceMode } from "../session/certify.js";
import { sessionTag } from "../session/evidence.js";
import { projectPolicy } from "../session/policy.js";
import { boundTask } from "../session/tasks.js";
import { searchStateDirectory, validSearchSession } from "./local-state.js";
import { CONTEXT_SEARCH_HEADER } from "./output.js";
import { contextArm, getSearchConfig, providerSessionId, traceContext } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";
const SEARCH = 'morpheus context search "<task terms>"';
const READ = "morpheus context task-read <indexed-path>";
const PROMPT = "UserPromptSubmit";
const MCP_SEARCH = "search_project_context";
const MCP_READ = "read_project_record";
async function preferredLookup(root) {
    return (await getSearchConfig(root)).transport === "mcp";
}
function statePath(root, session, state) {
    return join(root, "local/context-search/startup", sessionTag(session) + "." + state);
}
async function stateExists(root, session, state) {
    return (await readFile(statePath(root, session, state), "utf8").catch(() => "")) === "1\n";
}
async function taskRoot(root, session) {
    const active = (await boundTask(root, session).catch(() => null))?.root;
    return active && active !== root && await isBounded(active, session) ? active : root;
}
async function isBounded(root, session) {
    return (await projectPolicy(root, session)).rollout?.startup === "bounded";
}
/** Search evidence follows a session across the repository just like core reads. */
async function progress(root, session) {
    if (await stateExists(root, session, "seen"))
        return { prompted: true, seen: true };
    const checkouts = await evidenceCheckouts(root);
    const states = await Promise.all(checkouts.map(async (checkout) => ({
        prompted: await stateExists(checkout, session, "prompt"),
        seen: await stateExists(checkout, session, "seen"),
    })));
    return { prompted: states.some(state => state.prompted), seen: states.some(state => state.seen) };
}
async function needsTaskContext(root, session) {
    if (!await isBounded(root, session))
        return false;
    const { prompted, seen } = await progress(root, session);
    return prompted && !seen;
}
/** Only sessions whose prompt and read hooks ran get the task check. */
export async function taskContextRefusal(root, session = providerSessionId()) {
    if (!validSearchSession(session))
        return;
    const { projectRoot } = await import("../session/read-hook.js");
    const checkout = await projectRoot(root);
    if (!checkout || !await needsTaskContext(checkout, session))
        return;
    const mode = await evidenceMode(checkout, { ...process.env, MORPHEUS_CONTEXT_SESSION_ID: session });
    if (mode.kind !== "recorded")
        return;
    const active = await taskRoot(checkout, session);
    if (!await hasTaskSource(active, session))
        return;
    if (await preferredLookup(active)) {
        return `Load context for the task before continuing. In ${active}, use the Morpheus Context MCP tools \`${MCP_SEARCH}\` or \`${MCP_READ}\`. Inspect a cited excerpt, then retry. If MCP is unavailable, use \`${SEARCH}\`.`;
    }
    return `Load context for the task before continuing. In ${active}, run \`${SEARCH}\` and inspect its excerpts, or run \`${READ}\` for a known governing record. If search is empty, refine the query or read a source directly. Then retry this command.`;
}
async function taskPaths(root, session) {
    const config = await getSearchConfig(root);
    const coverage = await discoverSources(root, config);
    const required = new Set((await projectPolicy(root, session)).requiredInputs);
    return coverage.included.filter(path => path !== "AGENTS.md" && !required.has(path));
}
async function taskRecords(root, session, paths) {
    const allowed = new Set(await taskPaths(root, session));
    return readContextSources(root, paths.filter(path => allowed.has(path)));
}
async function hasTaskSource(root, session) {
    for (const path of await taskPaths(root, session)) {
        const [record] = await readContextSources(root, [path]);
        if (record?.text.trim())
            return true;
    }
    return false;
}
/** An exact-path read uses the same visible citation as a search result. */
export async function taskRecord(root, session, path) {
    return (await taskRecords(root, session, [path]))[0];
}
function citedText(text) {
    const header = text.indexOf(CONTEXT_SEARCH_HEADER + "\n");
    if (header >= 0)
        return text.slice(header + CONTEXT_SEARCH_HEADER.length + 1);
    const json = text.split("\n").find(line => line.startsWith('{"kind":"morpheus-context-search",'));
    if (!json)
        return "";
    const value = JSON.parse(json);
    return typeof value.output === "string" ? value.output : "";
}
/** Credit an excerpt only when the hook actually saw matching, current source text. */
export async function observeTaskContext(root, session, text, operation) {
    const output = citedText(text);
    if (!output || !validSearchSession(session))
        return;
    const pending = await needsTaskContext(root, session);
    if (!pending && !operation)
        return;
    const citations = [...output.matchAll(/^([^\n]+\.md):(\d+)-(\d+)\n/gm)];
    if (!citations.length)
        return;
    const records = await taskRecords(root, session, citations.map(match => match[1]));
    if (!citations.some(match => isCurrentExcerpt(output, match, records)))
        return;
    if (pending) {
        await searchStateDirectory(root, "startup");
        await writeFile(statePath(root, session, "seen"), "1\n", { mode: 0o600 });
    }
    if (operation) {
        const arm = await contextArm(root, session);
        await traceContext(root, { type: "visible", arm: arm.arm, engine: arm.engine, session: arm.session,
            rollout: arm.id, transport: "mcp", operation });
    }
}
function isCurrentExcerpt(output, match, records) {
    const record = records.find(value => value.path === match[1]);
    const from = Number(match[2]);
    const to = Number(match[3]);
    if (!record || from < 1 || to < from || to - from > 99)
        return false;
    const lines = record.text.replace(/\r?\n$/, "").split(/\r?\n/);
    if (to > lines.length)
        return false;
    const excerpt = lines.slice(from - 1, to).join("\n");
    if (!excerpt.trim())
        return false;
    const returned = output.slice(match.index + match[0].length);
    return returned === excerpt || returned.startsWith(excerpt + "\n");
}
function promptPayload(raw) {
    const input = JSON.parse(raw);
    if (input?.hook_event_name !== PROMPT || !validSearchSession(input.session_id))
        return;
    if (typeof input.cwd !== "string" || !isAbsolute(input.cwd) || typeof input.prompt !== "string" || !input.prompt.trim())
        return;
    return input;
}
export async function taskPrompt(raw, locateRoot) {
    const input = promptPayload(raw);
    if (!input)
        return;
    const session = input.session_id;
    const cwdRoot = await locateRoot(input.cwd);
    if (!cwdRoot)
        return;
    if (!await isBounded(cwdRoot, session))
        return;
    const root = await taskRoot(cwdRoot, session);
    if (await stateExists(root, session, "prompt"))
        return;
    if ((await progress(root, session)).prompted)
        return;
    await searchStateDirectory(root, "startup");
    const first = await writeFile(statePath(root, session, "prompt"), "1\n", { flag: "wx", mode: 0o600 })
        .then(() => true, error => { if (error.code === "EEXIST")
        return false; throw error; });
    if (!first)
        return;
    if (!await hasTaskSource(root, session)) {
        return "Task context search found no readable project records beyond the startup core. Continue with the core. Use morpheus context coverage to check the worktree and project search manifest.";
    }
    const prefix = providerSessionId() === session ? "" : `MORPHEUS_CONTEXT_SESSION_ID='${session.replaceAll("'", "'\\''")}' `;
    if (await preferredLookup(root)) {
        return `For the first project task, once its scope is clear and before implementation, use the Morpheus Context MCP tool \`${MCP_SEARCH}\` in the active task worktree (1,000 tokens by default). For a known record use \`${MCP_READ}\`. Open governing sources and refine an empty search. Use \`get_context_overview\` if you are new to this project or Morpheus. If MCP is unavailable, fall back to \`${prefix}${SEARCH}\`. Conversational replies can proceed without a lookup.`;
    }
    return `For the first project task, once its scope is clear and before implementation, load task context in ${root} with \`${prefix}${SEARCH}\` (1,000 tokens by default). For a known governing record use \`${prefix}${READ}\`. Read the returned excerpts and open any governing sources they cite. Refine an empty search. Conversational replies can proceed without a lookup.`;
}
export async function runTaskPromptHook() {
    const { projectRoot } = await import("../session/read-hook.js");
    try {
        const additionalContext = await taskPrompt(readFileSync(0, "utf8"), projectRoot);
        if (additionalContext)
            console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: PROMPT, additionalContext } }));
    }
    catch {
        // An unsupported prompt payload must not interrupt the conversation.
    }
    return 0;
}
//# sourceMappingURL=task-start.js.map