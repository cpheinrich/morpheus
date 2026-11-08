import { checkoutIdentity } from "../session/start.js";
import { boundTask } from "../session/tasks.js";
import { validSearchSession } from "./local-state.js";
import { getSearchConfig, providerSessionId } from "./rollout.js";

export function contextMcpSession(metadata: unknown, env = process.env): string | undefined {
  const thread = metadata && typeof metadata === "object" && "threadId" in metadata ? metadata.threadId : undefined;
  if (typeof thread === "string" && validSearchSession(thread)) return thread;
  return env.CLAUDE_CODE_SESSION_ID || providerSessionId(env);
}

/** The launch cwd is supplied by the host. Only a validated session binding may move its worktree. */
export async function contextMcpScope(cwd: string, session?: string) {
  const checkout = await checkoutIdentity(cwd);
  const binding = session ? await boundTask(checkout.root, session) : null;
  if (process.env.MORPHEUS_CONTEXT_WORKTREE_PIN === "1" && binding && binding.root !== checkout.root) {
    throw new Error("The task is bound to a different worktree than this Factory worker's admitted checkout.");
  }
  const root = binding?.root ?? checkout.root;
  const config = await getSearchConfig(root);
  if (config.rollout && !validSearchSession(session)) {
    throw new Error("Morpheus Context needs the host's session identity for this rollout. Reopen the project session or use the startup brief's CLI fallback.");
  }
  return { root, session, task: binding?.task, config };
}
