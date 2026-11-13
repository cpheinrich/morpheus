import { checkoutIdentity, sessionGit } from "../session/start.js";
import { warmTantivyIndex } from "./engine.js";
import { persistentContextCache } from "./local-state.js";
import { resolveTrunk } from "../session/git.js";
import { projectPolicy } from "../session/policy.js";
import { getSearchConfig, traceContext } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";
/** Build after a managed pull, so new worktrees can start with the refreshed trunk index. */
export async function warmTrunkContext(cwd) {
    const { root, linked } = await checkoutIdentity(cwd);
    if (linked)
        return;
    const { branch } = await resolveTrunk(root, (await projectPolicy(root)).trunk);
    if (await sessionGit(root, ["branch", "--show-current"]) === branch)
        await warmContext(root, "cli");
}
/** Build in the background when the MCP host starts, before the first search. */
export async function warmContextMcp(cwd) {
    await warmContext(cwd, "mcp");
}
async function warmContext(cwd, transport) {
    const started = performance.now();
    const { root } = await checkoutIdentity(cwd);
    const config = await getSearchConfig(root);
    const cache = await persistentContextCache(root).catch(() => undefined);
    if (!cache)
        return;
    const base = { type: "warm", transport, arm: "tantivy-full", engine: "tantivy", rollout: config.rollout?.id, mcpStartedAt: transport === "mcp" ? performance.timeOrigin : undefined };
    try {
        const { included } = await discoverSources(root, config);
        const sources = await readContextSources(root, included);
        const timing = await warmTantivyIndex(sources, cache);
        const { buildMs, waitMs, cacheHit } = timing ?? {};
        await traceContext(root, { ...base, outcome: timing ? "ok" : "empty", queryMs: performance.now() - started, buildMs, waitMs, cacheHit });
    }
    catch {
        await traceContext(root, { ...base, outcome: "error", queryMs: performance.now() - started });
    }
}
//# sourceMappingURL=warm.js.map