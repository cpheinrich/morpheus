import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { roadmapIdFromBranch } from "../pm/id.js";
import { checkoutIdentity, sessionGit } from "../session/start.js";
import { listWorktrees } from "../session/worktrees.js";
import { boundTask } from "../session/tasks.js";
import { validSearchSession } from "./local-state.js";
import { getSearchConfig, providerSessionId } from "./rollout.js";

export function contextMcpSession(metadata: unknown, env = process.env): string | undefined {
  if (metadata && typeof metadata === "object") {
    // Codex hooks and descendant threads share the provider session ID.
    if ("sessionId" in metadata && typeof metadata.sessionId === "string" && validSearchSession(metadata.sessionId)) return metadata.sessionId;
    if ("threadId" in metadata && typeof metadata.threadId === "string" && validSearchSession(metadata.threadId)) return metadata.threadId;
  }
  return env.CLAUDE_CODE_SESSION_ID || providerSessionId(env);
}

/** Read-only targets must be registered worktrees of the host repository. */
async function explicitCheckout(cwd: string, worktree: string) {
  if (!isAbsolute(worktree)) throw new Error("Choose an absolute worktree path.");
  const launch = await checkoutIdentity(cwd);
  const target = await checkoutIdentity(worktree);
  if (target.common !== launch.common) throw new Error("Choose a worktree of the same repository.");
  const worktrees = await listWorktrees(launch.root);
  const roots = await Promise.all(worktrees.map(entry => realpath(entry.path).catch(() => null)));
  if (!roots.includes(target.root)) throw new Error("Choose a registered worktree of the same repository.");
  if (process.env.MORPHEUS_CONTEXT_WORKTREE_PIN === "1" && target.root !== launch.root) {
    throw new Error("The requested worktree is outside this Factory worker's admitted checkout.");
  }
  return target;
}

/** Explicit reads do not rebind the session; implicit reads retain the existing binding. */
export async function contextMcpScope(cwd: string, session?: string, worktree?: string) {
  const checkout = worktree !== undefined ? await explicitCheckout(cwd, worktree) : await checkoutIdentity(cwd);
  const binding = worktree === undefined && session ? await boundTask(checkout.root, session) : null;
  if (process.env.MORPHEUS_CONTEXT_WORKTREE_PIN === "1" && binding && binding.root !== checkout.root) {
    throw new Error("The task is bound to a different worktree than this Factory worker's admitted checkout.");
  }
  const root = binding?.root ?? checkout.root;
  const config = await getSearchConfig(root);
  const task = binding?.task ?? roadmapIdFromBranch(await sessionGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""));
  return { root, session, task: task ?? undefined, config };
}
