import { endTerm } from "../session/context.js";
import { roadmapIdFromBranch } from "../pm/id.js";
import { boundTask, bindTask } from "../session/tasks.js";
import { join } from "node:path";
import { prepareRepository, parseSessionInput, sessionGit } from "../session/start.js";
import { projectPolicy } from "../session/policy.js";
import { CANONICAL_INPUTS } from "../session/lease.js";
import { brief } from "./context.js";
/** Hooks pipe JSON; interactive calls must not wait for terminal input. */
export async function sessionHookInput() {
    if (process.stdin.isTTY)
        return parseSessionInput("", process.env.CODEX_THREAD_ID);
    const raw = await new Promise((resolve, reject) => {
        let data = "";
        const finish = (error) => {
            clearTimeout(timer);
            process.stdin.off("data", onData);
            process.stdin.off("end", onEnd);
            process.stdin.off("error", onError);
            process.stdin.pause();
            if (error)
                reject(error);
            else
                resolve(data);
        };
        const onData = (chunk) => {
            data += chunk.toString();
            if (data.length > 64_000)
                finish(new Error("Session hook input exceeds 64 KB."));
        };
        const onEnd = () => finish();
        const onError = (error) => finish(error);
        // An inherited open stdin must not hang session startup. Partial JSON
        // fails visibly; an empty stream uses the provider's environment ID.
        const timer = setTimeout(() => finish(), 1_000);
        process.stdin.on("data", onData).once("end", onEnd).once("error", onError);
        process.stdin.resume();
    });
    return parseSessionInput(raw, process.env.CODEX_THREAD_ID);
}
export async function startSession(root, input, opts = {}) {
    try {
        // Even a failed fetch must not leave another session's receipt usable.
        await endTerm(root);
        const binding = await boundTask(root, input.sessionId);
        const here = roadmapIdFromBranch(await sessionGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]));
        if (binding && here && here !== binding.task)
            throw new Error(`This checkout is task ${here}, but the session is associated with ${binding.task}. Use pm resume <ID> to choose explicitly.`);
        if (binding && binding.root !== root)
            await endTerm(binding.root);
        const prepared = await prepareRepository(binding?.root ?? root, opts.offline);
        console.log(`Fetched ${prepared.trunk} at ${prepared.sha}.`);
        if (prepared.advanced)
            console.log("Fast-forwarded clean local trunk. Read the updated records before refreshing context.");
        console.log(`WORK IN: ${prepared.root}`);
        if (prepared.task) {
            await bindTask(prepared.root, prepared.task, input.sessionId);
            console.log(`Existing task: ${prepared.task}. Continue it here only if it is the requested task; a new request must claim its own worktree.`);
        }
        else if (binding?.pending) {
            console.log(`Prepared task: ${binding.task}, not claimed yet. Read and refresh here, then run pm claim ${binding.task}.`);
        }
        else {
            console.log("No implementation task is associated with this checkout. Investigation needs no new worktree. Use morpheus pm claim <ID> when new implementation starts, or morpheus pm resume <ID> for existing work.");
        }
        if (prepared.behind)
            console.log(`This checkout is ${prepared.behind} commit(s) behind fetched trunk. Existing edits were preserved. Integrate trunk explicitly before certifying context; inspect latest source with git show ${prepared.sha}:<path>.`);
        console.log("Use this absolute directory for subsequent commands. A hook cannot change its parent agent's working directory.");
        console.log("Read AGENTS.md and required context records from the chosen checkout:");
        const policy = await projectPolicy(prepared.root);
        for (const path of policy.requiredInputs ?? CANONICAL_INPUTS)
            console.log(`  ${join(prepared.root, path)}`);
        if (input.sessionId)
            console.log(`To retain this session's task association, pass --session-id ${"'" + input.sessionId.replaceAll("'", "'\\''") + "'"} to pm claim or pm resume (Codex also supplies CODEX_THREAD_ID automatically).`);
        console.log("Then run morpheus context refresh there. No receipt is issued by startup.");
        console.log("");
        return await brief(prepared.root, opts);
    }
    catch (error) {
        console.error(`SESSION START BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
        console.error("Do not start new work in the old checkout or claim that current code was loaded. Repair startup and retry.");
        return 1;
    }
}
//# sourceMappingURL=session-start.js.map