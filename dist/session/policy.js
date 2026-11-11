import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CANONICAL_INPUTS } from "./lease.js";
import { contextArm, isHumanInbox, parseSearchConfig } from "../context-search/rollout.js";
const asStrings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
/** `morpheus.json`'s `context` block, `{}` when it has none, or null when the manifest cannot be read. */
async function contextConfig(root) {
    try {
        const manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"));
        return manifest.context ?? {};
    }
    catch {
        return null;
    }
}
async function rolloutPolicy(root, config, runnerId) {
    if (config.search === undefined)
        return;
    try {
        const search = parseSearchConfig(config.search);
        if (search.rollout)
            return contextArm(root, runnerId, search);
    }
    catch {
        return { arm: "tantivy-full", engine: "tantivy", startup: "full", unavailable: "Invalid context search settings; using the existing required reads." };
    }
}
function requiredRecords(config, declared, rollout) {
    if (!rollout?.id) {
        const inbox = typeof config.handle === "string" ? [`hq/team/${config.handle}.md`] : [];
        return [...CANONICAL_INPUTS, ...declared, ...inbox];
    }
    const extras = declared.filter(path => !isHumanInbox(path));
    const startup = rollout.coreInputs ? ["CLAUDE.md", ...rollout.coreInputs] : CANONICAL_INPUTS;
    return [...startup, ...extras];
}
export async function projectPolicy(root, runnerId) {
    const config = await contextConfig(root);
    if (!config)
        return {};
    const trunk = typeof config.trunk === "string" && config.trunk ? { trunk: config.trunk } : {};
    const raw = Array.isArray(config.requiredInputs) ? config.requiredInputs : null;
    const declared = asStrings(raw);
    const rollout = await rolloutPolicy(root, config, runnerId);
    // `[]` stays `[]` **only when it was written as `[]`**. Gating on the
    // filtered array instead would let `["…", {path: "x"}]` — a project trying
    // to *add* records — collapse into the one value that switches coverage
    // off. Declared-and-nothing-usable is not declared-as-none, and a filter
    // that erases the difference is the absent-reads-as-empty defect again.
    if (!rollout && raw?.length === 0 && typeof config.handle !== "string") {
        return { requiredInputs: [], ...trunk };
    }
    const dropped = (raw?.length ?? 0) - declared.length;
    return {
        requiredInputs: [...new Set(requiredRecords(config, declared, rollout))],
        ...(rollout ? { rollout } : {}),
        ...trunk,
        ...(dropped > 0
            ? { droppedInputs: (raw ?? []).filter((v) => typeof v !== "string").map((v) => JSON.stringify(v)) }
            : {}),
    };
}
/**
 * Session identity is the worktree, because CLAUDE.md already mandates one
 * worktree per parallel session — so two agents cannot share an id, and one
 * agent resuming in the same checkout keeps its own. Hashed rather than
 * slugged so the filename cannot collide or leak a path.
 */
export function sessionId(worktree) {
    return createHash("sha256").update(worktree).digest("hex").slice(0, 16);
}
//# sourceMappingURL=policy.js.map