import { CONTEXT_STARTUP_GUIDANCE } from "../context-search/install.js";
import { endTerm } from "../session/context.js";
import { roadmapIdFromBranch } from "../pm/id.js";
import { boundTask, bindTask } from "../session/tasks.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { contextArm, providerSessionId, traceContext, type ContextArm } from "../context-search/rollout.js";
import { prepareRepository, parseSessionInput, sessionGit, type SessionStartInput } from "../session/start.js";
import { projectPolicy } from "../session/policy.js";
import { CANONICAL_INPUTS } from "../session/lease.js";
import { brief, type BriefOptions } from "./context.js";
import { formatLag, formatRescue } from "../session/trunk-rescue.js";

/** Hooks pipe JSON; interactive calls must not wait for terminal input. */
export async function sessionHookInput(): Promise<SessionStartInput> {
  if (process.stdin.isTTY) return parseSessionInput("", process.env.CODEX_THREAD_ID);
  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    const finish = (error?: Error) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
      process.stdin.pause();
      if (error) reject(error); else resolve(data);
    };
    const onData = (chunk: Buffer | string) => {
      data += chunk.toString();
      if (data.length > 64_000) finish(new Error("Session hook input exceeds 64 KB."));
    };
    const onEnd = () => finish();
    const onError = (error: Error) => finish(error);
    // An inherited open stdin must not hang session startup. Partial JSON
    // fails visibly; an empty stream uses the provider's environment ID.
    const timer = setTimeout(() => finish(), 1_000);
    process.stdin.on("data", onData).once("end", onEnd).once("error", onError);
    process.stdin.resume();
  });
  return parseSessionInput(raw, process.env.CODEX_THREAD_ID);
}

type Prepared = Awaited<ReturnType<typeof prepareRepository>>;
function printPreparation(prepared: Prepared): void {
  console.log(`Fetched ${prepared.trunk} at ${prepared.sha}.`);
  if (prepared.rescue) for (const line of formatRescue(prepared.rescue, prepared.trunk)) console.log(line);
  if (prepared.fastForwardError) console.log(`!!! Could not fast-forward clean trunk: ${prepared.fastForwardError.split("\n")[0]} Move or delete the named untracked file(s), then rerun morpheus context brief.`);
  if (prepared.advanced) console.log("Fast-forwarded clean local trunk. Read the updated records before refreshing context.");
}

/** Binds and names the checkout's task, a prepared but unclaimed one, or says there is none. */
async function reportTask(prepared: Prepared, binding: Awaited<ReturnType<typeof boundTask>>, sessionId: string | undefined): Promise<void> {
  if (prepared.task) {
    await bindTask(prepared.root, prepared.task, sessionId);
    console.log(`Existing task: ${prepared.task}. Continue it here only if it is the requested task; a new request must claim its own worktree.`);
  } else if (binding?.pending) {
    console.log(`Prepared task: ${binding.task}, not claimed yet. Read and refresh here, then run pm claim ${binding.task}.`);
  } else {
    console.log("No implementation task is associated with this checkout. Investigation needs no new worktree. Use morpheus pm claim <ID> when new implementation starts, or morpheus pm resume <ID> for existing work.");
  }
}

async function printRollout(root: string, paths: readonly string[], arm: ContextArm, id?: string): Promise<void> {
  if (arm.unavailable) console.log(`! ${arm.unavailable}`);
  if (!arm.id) return;
  console.log(`Context search rollout ${arm.id}: ${arm.arm}; engine ${arm.engine}.`);
  const { getSearchConfig } = await import("../context-search/rollout.js");
  const mcp = (await getSearchConfig(root)).transport === "mcp";
  const sessionId = id ?? providerSessionId();
  if (mcp && arm.startup === "bounded" && sessionId) {
    const { armMcpTaskContext } = await import("../context-search/task-start.js");
    await armMcpTaskContext(root, sessionId).catch(() => {});
  }
  console.log(mcp
    ? "Use this session's required records as the startup set, then use the Morpheus Context MCP search_project_context tool once the task is known. The CLI is a fallback if MCP is unavailable."
    : "Use this session's required records listed here as the startup set, then run `morpheus context search <query>` once the task is known.");
  console.log("Use 1,000 returned tokens for a focused lookup, or up to 2,500 when several sources are needed.");
  if (id && id !== providerSessionId()) {
    const quoted = "'" + id.replaceAll("'", "'\\''") + "'";
    console.log(`Provider session ID is not available in this shell. Prefix Morpheus commands in this session with MORPHEUS_CONTEXT_SESSION_ID=${quoted} to retain its assignment and receipt.`);
  }
  const contents = await Promise.all(paths.map(path => readFile(join(root, path), "utf8"))).catch(() => undefined);
  const startupBytes = contents?.reduce((total, content) => total + Buffer.byteLength(content), 0);
  const { countContextTokens } = await import("../context-search/engine.js");
  const startupTokens = contents?.reduce((total, content) => total + countContextTokens(content), 0);
  await traceContext(root, { type: "assignment", arm: arm.arm, engine: arm.engine,
    session: arm.session, rollout: arm.id, startup: arm.startup, startupBytes, startupTokens, transport: mcp ? "mcp" : "cli" });
}

/** Trunk lag, the records to read from this checkout, and how to keep the session's task association. */
async function printReadInstructions(prepared: Prepared, sessionId: string | undefined, started?: Date): Promise<boolean> {
  if (prepared.behind) {
    for (const line of formatLag(prepared.lag, prepared.trunk, new Date())) console.log(line);
    console.log(`Existing edits were preserved. Integrate trunk explicitly before certifying context; inspect latest source with git show ${prepared.sha}:<path>.`);
  }
  console.log("Use this absolute directory for subsequent commands. A hook cannot change its parent agent's working directory.");
  console.log("Read AGENTS.md and required context records from the chosen checkout:");
  const policy = await projectPolicy(prepared.root, sessionId);
  const paths = policy.requiredInputs ?? CANONICAL_INPUTS;
  for (const path of paths) console.log(`  ${join(prepared.root, path)}`);
  if (started) {
    const arm = policy.rollout ?? await contextArm(prepared.root, sessionId).catch(() => undefined);
    if (arm?.session) await traceContext(prepared.root, { type: "session-start",
      arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id }, started);
  }
  if (policy.rollout) await printRollout(prepared.root, paths, policy.rollout, sessionId);
  if (sessionId) console.log(`To retain this session's task association, pass --session-id ${"'" + sessionId.replaceAll("'", "'\\''") + "'"} to pm claim or pm resume (Codex also supplies CODEX_THREAD_ID automatically).`);
  console.log("Then run morpheus context refresh there. No receipt is issued by startup.");
  return policy.rollout?.id !== undefined;
}

export async function startSession(root: string, input: SessionStartInput, opts: BriefOptions = {}): Promise<number> {
  const started = new Date();
  try {
    // Even a failed fetch must not leave another session's receipt usable.
    await endTerm(root, input.sessionId);
    const binding = await boundTask(root, input.sessionId);
    const here = roadmapIdFromBranch(await sessionGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]));
    if (binding && here && here !== binding.task) throw new Error(`This checkout is task ${here}, but the session is associated with ${binding.task}. Use pm resume <ID> to choose explicitly.`);
    if (binding && binding.root !== root) await endTerm(binding.root, input.sessionId);
    console.log(CONTEXT_STARTUP_GUIDANCE);
    const prepared = await prepareRepository(binding?.root ?? root, opts.offline, opts.rescue ?? {});
    printPreparation(prepared);
    console.log(`WORK IN: ${prepared.root}`);
    await reportTask(prepared, binding, input.sessionId);
    const rollout = await printReadInstructions(prepared, input.sessionId, input.source === "startup" ? started : undefined);
    console.log("");
    return await brief(prepared.root, { ...opts, startup: { sessionId: input.sessionId, rollout } });
  } catch (error) {
    console.error(`SESSION START BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Do not start new work in the old checkout or claim that current code was loaded. Repair startup and retry.");
    return 1;
  }
}
