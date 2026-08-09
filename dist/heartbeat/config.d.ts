import { z } from "zod";
import { type HeartbeatConfig } from "./assess.js";
/**
 * The `heartbeat` block of `morpheus.json`.
 *
 * Config rather than flags-only because the ceiling is a property of the
 * project — how much parallel work it can absorb — not of whoever happens to
 * run a beat. `dispatch` lives here for the same reason and defaults to false:
 * turning it on is a decision that should appear in a diff.
 */
export declare const HeartbeatSettings: z.ZodObject<{
    ceiling: z.ZodDefault<z.ZodNumber>;
    dispatch: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
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
export declare function readConfig(root: string): Promise<HeartbeatConfig>;
/** Environment variables that would let a beat actually start an agent. */
export declare const DISPATCH_CREDENTIALS: string[];
/**
 * Whether anything could run an agent unattended.
 *
 * Split from `readConfig` because they answer different questions — *are we
 * allowed to dispatch* versus *could we even if we were*. Collapsing them would
 * let a repo with `dispatch: true` and no key report as dispatching.
 */
export declare function hasDispatchCredential(env?: NodeJS.ProcessEnv): boolean;
