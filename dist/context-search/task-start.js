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
const SUBAGENT = "SubagentStart";
const PRE_TOOL = "PreToolUse";
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
        return { prompted: await stateExists(root, session, "prompt"), armed: true, seen: true };
    const checkouts = await evidenceCheckouts(root);
    const states = await Promise.all(checkouts.map(async (checkout) => ({
        prompted: await stateExists(checkout, session, "prompt"),
        armed: await stateExists(checkout, session, "armed"),
        seen: await stateExists(checkout, session, "seen"),
    })));
    const prompted = states.some(state => state.prompted);
    return { prompted, armed: prompted || states.some(state => state.armed), seen: states.some(state => state.seen) };
}
async function markOnce(root, session, marker) {
    await searchStateDirectory(root, "startup");
    return writeFile(statePath(root, session, marker), "1\n", { flag: "wx", mode: 0o600 })
        .then(() => true, error => { if (error.code === "EEXIST")
        return false; throw error; });
}
/** The existing startup hook can arm the check independently of trust for the prompt reminder. */
export async function armMcpTaskContext(root, session) {
    if (validSearchSession(session))
        await markOnce(root, session, "armed");
}
async function needsTaskContext(root, session) {
    if (!await isBounded(root, session))
        return false;
    const { armed, seen } = await progress(root, session);
    return armed && !seen;
}
/** A startup or prompt hook arms the task check when read evidence is active. */
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
    return taskEvidencePaths(root, session, coverage.included);
}
async function taskEvidencePaths(root, session, paths) {
    const required = new Set((await projectPolicy(root, session)).requiredInputs);
    return paths.filter(path => path !== "AGENTS.md" && !required.has(path));
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
    const paths = new Set(citations.map(match => match[1]));
    const config = await getSearchConfig(root);
    const eligible = (await discoverSources(root, config)).included.filter(path => paths.has(path));
    const records = await readContextSources(root, eligible);
    const visible = citations.filter(match => isCurrentExcerpt(output, match, records)).map(match => match[1]);
    if (!visible.length)
        return;
    if (pending && (await taskEvidencePaths(root, session, visible)).length) {
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
    const submitted = new Date();
    const input = promptPayload(raw);
    if (!input)
        return;
    const session = input.session_id;
    const cwdRoot = await locateRoot(input.cwd);
    if (!cwdRoot)
        return;
    const arm = await contextArm(cwdRoot, session);
    if (!arm.session)
        return;
    const root = arm.startup === "bounded" ? await taskRoot(cwdRoot, session) : cwdRoot;
    if (await stateExists(root, session, "prompt"))
        return;
    const state = await progress(root, session);
    if (state.prompted)
        return;
    if (!await markOnce(root, session, "prompt"))
        return;
    await traceContext(root, { type: "prompt", arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id }, submitted);
    if (arm.startup !== "bounded" || state.seen)
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
/** Child sessions may not see the parent's startup or first-prompt hook. */
export async function subagentContext(input, locateRoot) {
    if (typeof input.cwd !== "string" || !isAbsolute(input.cwd) || !await locateRoot(input.cwd))
        return;
    return "For project records in your assigned worktree (decisions, lessons, roadmap, worklogs, runbooks, meeting notes), use the live Morpheus Context MCP search_project_context before shell search. Open relevant citations with read_project_record. If MCP is unavailable or cannot query the assigned checkout, use morpheus context search from that checkout and report the fallback. Use codebase-memory for code structure and exact reads for known source files.";
}
export async function runTaskPromptHook() {
    const { projectRoot } = await import("../session/read-hook.js");
    try {
        const raw = readFileSync(0, "utf8");
        const input = JSON.parse(raw);
        const event = input?.hook_event_name;
        if (event === PRE_TOOL) {
            // One entry point keeps the wired command stable; an older CLI ignores this event silently.
            const hint = await (await import("./search-hook.js")).searchHint(input, projectRoot);
            if (hint)
                console.log(JSON.stringify({ systemMessage: hint.systemMessage, hookSpecificOutput: { hookEventName: event, additionalContext: hint.additionalContext } }));
            return 0;
        }
        const additionalContext = event === SUBAGENT
            ? await subagentContext(input, projectRoot)
            : await taskPrompt(raw, projectRoot);
        if (additionalContext)
            console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }));
    }
    catch {
        // An unsupported hook payload must not interrupt the conversation.
    }
    return 0;
}
//# sourceMappingURL=task-start.js.map