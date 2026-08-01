import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DEFAULT_CEILING, type HeartbeatConfig } from "./assess.js";

/**
 * The `heartbeat` block of `morpheus.json`.
 *
 * Config rather than flags-only because the ceiling is a property of the
 * project — how much parallel work it can absorb — not of whoever happens to
 * run a beat. `dispatch` lives here for the same reason and defaults to false:
 * turning it on is a decision that should appear in a diff.
 */
export const HeartbeatSettings = z.object({
  ceiling: z.number().int().positive().default(DEFAULT_CEILING),
  dispatch: z.boolean().default(false),
});

/**
 * Read heartbeat settings from a repo's manifest.
 *
 * A missing file, a missing block, or an unparseable one all yield defaults —
 * a project that has never thought about the heartbeat still gets a safe one.
 * Deliberately different from the *dispatch credential* check, which refuses
 * loudly rather than defaulting: an absent config is a project that has not
 * opted in, while an absent credential is a configured intent that cannot be
 * honoured, and those must not read the same.
 */
export async function readConfig(root: string): Promise<HeartbeatConfig> {
  try {
    const raw = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as {
      heartbeat?: unknown;
    };
    const parsed = HeartbeatSettings.safeParse(raw.heartbeat ?? {});
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through to defaults */
  }
  return { ceiling: DEFAULT_CEILING, dispatch: false };
}

/** Environment variables that would let a beat actually start an agent. */
export const DISPATCH_CREDENTIALS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];

/**
 * Whether anything could run an agent unattended.
 *
 * Split from `readConfig` because they answer different questions — *are we
 * allowed to dispatch* versus *could we even if we were*. Collapsing them would
 * let a repo with `dispatch: true` and no key report as dispatching.
 */
export function hasDispatchCredential(env: NodeJS.ProcessEnv = process.env): boolean {
  return DISPATCH_CREDENTIALS.some((k) => (env[k] ?? "").trim().length > 0);
}
