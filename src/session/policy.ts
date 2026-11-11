import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CANONICAL_INPUTS, type LeasePolicy } from "./lease.js";
import { contextArm, isHumanInbox, parseSearchConfig, type ContextArm } from "../context-search/rollout.js";

/**
 * The `context` block of `morpheus.json`. Absent in almost every project, and
 * that is the intended state — `morpheus init` scaffolds `CLAUDE.md`,
 * `.agent/decisions.md` and `.agent/learned.md`, which is exactly the default
 * required set, so a project only needs this block when it has *more*.
 */
interface ContextConfig {
  /** Extra records this project treats as canonical. */
  requiredInputs?: unknown;
  search?: unknown;
  /**
   * The GitHub handle whose inbox this project's sessions must have read.
   * `hq/team/<handle>.md` is where a human replies, so a session resuming
   * without it is the failure this whole protocol is about — and the policy
   * cannot know the handle, which is why it is declared here rather than
   * baked into `CANONICAL_INPUTS`.
   */
  handle?: unknown;
  /**
   * The canonical trunk, `remote/branch`. Declared rather than assumed
   * because `origin` is not always canonical — for a fork contributor
   * `origin` is their fork, and a lease measured against a fork's `main`
   * certifies `fresh` while the real trunk moves.
   */
  trunk?: unknown;
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Resolve this project's required set.
 *
 * **Never returns `[]` from a missing, blank or unparseable manifest** — that
 * is the one value that switches coverage off, and reaching it by accident
 * would hand every generated project a check that passes for a session that
 * read nothing. A project that genuinely has no canonical records has to say
 * `"requiredInputs": []` on purpose, which this preserves.
 */
export interface ProjectContext extends LeasePolicy {
  /** `undefined` means undeclared — `resolveTrunk` asks `origin/HEAD` then. */
  trunk?: string;
  /** Pilot assignment, including safe fallback when the core or provider ID is unavailable. */
  rollout?: ContextArm;
  /**
   * Entries of `requiredInputs` that were not strings and so are not in the
   * required set. Surfaced rather than dropped: it lands on the project that
   * was trying to *add* records, which is the only reason the field exists,
   * and coverage narrowing silently is the same shape as coverage switching
   * off silently.
   */
  droppedInputs?: string[];
}

/** `morpheus.json`'s `context` block, `{}` when it has none, or null when the manifest cannot be read. */
async function contextConfig(root: string): Promise<ContextConfig | null> {
  try {
    const manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as {
      context?: ContextConfig;
    };
    return manifest.context ?? {};
  } catch {
    return null;
  }
}

async function rolloutPolicy(root: string, config: ContextConfig, runnerId?: string): Promise<ContextArm | undefined> {
  if (config.search === undefined) return;
  try {
    const search = parseSearchConfig(config.search);
    if (search.rollout) return contextArm(root, runnerId, search);
  } catch {
    return { arm: "tantivy-full", engine: "tantivy", startup: "full", unavailable: "Invalid context search settings; using the existing required reads." };
  }
}

function requiredRecords(config: ContextConfig, declared: string[], rollout?: ContextArm): string[] {
  if (!rollout?.id) {
    const inbox = typeof config.handle === "string" ? [`hq/team/${config.handle}.md`] : [];
    return [...CANONICAL_INPUTS, ...declared, ...inbox];
  }
  const extras = declared.filter(path => !isHumanInbox(path));
  const startup = rollout.coreInputs ? ["CLAUDE.md", ...rollout.coreInputs] : CANONICAL_INPUTS;
  return [...startup, ...extras];
}

export async function projectPolicy(root: string, runnerId?: string): Promise<ProjectContext> {
  const config = await contextConfig(root);
  if (!config) return {};
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
export function sessionId(worktree: string): string {
  return createHash("sha256").update(worktree).digest("hex").slice(0, 16);
}
