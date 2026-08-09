import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CANONICAL_INPUTS } from "./lease.js";
const asStrings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
export async function projectPolicy(root) {
    let config = {};
    try {
        const manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"));
        config = manifest.context ?? {};
    }
    catch {
        return {};
    }
    const trunk = typeof config.trunk === "string" && config.trunk ? { trunk: config.trunk } : {};
    const raw = Array.isArray(config.requiredInputs) ? config.requiredInputs : null;
    const declared = raw ? asStrings(raw) : null;
    const inbox = typeof config.handle === "string" ? [`hq/team/${config.handle}.md`] : [];
    // `[]` stays `[]` **only when it was written as `[]`**. Gating on the
    // filtered array instead would let `["…", {path: "x"}]` — a project trying
    // to *add* records — collapse into the one value that switches coverage
    // off. Declared-and-nothing-usable is not declared-as-none, and a filter
    // that erases the difference is the absent-reads-as-empty defect again.
    if (raw !== null && raw.length === 0 && inbox.length === 0) {
        return { requiredInputs: [], ...trunk };
    }
    const dropped = raw && declared ? raw.length - declared.length : 0;
    return {
        requiredInputs: [...new Set([...CANONICAL_INPUTS, ...(declared ?? []), ...inbox])],
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