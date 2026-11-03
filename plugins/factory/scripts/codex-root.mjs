// MCP connections can outlive a chat. Codex overwrites _meta.threadId for each
// call; model-supplied arguments and the process's old session are not its owner.
export function codexRootId(extra, env = process.env) {
  const id = extra?._meta && Object.hasOwn(extra._meta, "threadId")
    ? extra._meta.threadId : env.CODEX_THREAD_ID;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(typeof id === "string" ? id : ""))
    throw new Error("Factory could not verify this Codex root task id; delegation refused.");
  return id;
}
