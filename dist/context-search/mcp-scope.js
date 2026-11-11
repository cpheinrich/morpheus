import { roadmapIdFromBranch } from "../pm/id.js";
import { checkoutIdentity, sessionGit } from "../session/start.js";
import { boundTask } from "../session/tasks.js";
import { validSearchSession } from "./local-state.js";
import { getSearchConfig, providerSessionId } from "./rollout.js";
export function contextMcpSession(metadata, env = process.env) {
    if (metadata && typeof metadata === "object") {
        // Codex hooks and descendant threads share the provider session ID.
        if ("sessionId" in metadata && typeof metadata.sessionId === "string" && validSearchSession(metadata.sessionId))
            return metadata.sessionId;
        if ("threadId" in metadata && typeof metadata.threadId === "string" && validSearchSession(metadata.threadId))
            return metadata.threadId;
    }
    return env.CLAUDE_CODE_SESSION_ID || providerSessionId(env);
}
/** The launch cwd is supplied by the host. Only a validated session binding may move its worktree. */
export async function contextMcpScope(cwd, session) {
    const checkout = await checkoutIdentity(cwd);
    const binding = session ? await boundTask(checkout.root, session) : null;
    if (process.env.MORPHEUS_CONTEXT_WORKTREE_PIN === "1" && binding && binding.root !== checkout.root) {
        throw new Error("The task is bound to a different worktree than this Factory worker's admitted checkout.");
    }
    const root = binding?.root ?? checkout.root;
    const config = await getSearchConfig(root);
    const task = binding?.task ?? roadmapIdFromBranch(await sessionGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""));
    return { root, session, task: task ?? undefined, config };
}
//# sourceMappingURL=mcp-scope.js.map