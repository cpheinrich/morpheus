import { type TrunkRef } from "./git.js";
/** The project's own trunk, ignoring any task base. */
export declare function projectTrunk(root: string): Promise<TrunkRef>;
/** The branch this checkout's task integrates into, on the trunk's remote. */
export declare function taskTrunk(root: string): Promise<TrunkRef>;
/** The declared base, or null when the task (or checkout) uses the trunk. */
export declare function declaredBase(root: string): Promise<string | null>;
/**
 * The base a prepared detached checkout was made for: `undefined` when no preparation
 * marker names this checkout, `null` when it was prepared from the trunk.
 */
export declare function preparedBase(root: string): Promise<string | null | undefined>;
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<string>;
/**
 * Check an explicitly requested base before anything is prepared, branched or pushed.
 *
 * Returns null for the trunk itself, which is the default. Any other branch must be named
 * plainly and be protected in the trunk remote's GitHub repository, so fixes reach it only
 * through reviewed pull requests. An unreadable answer refuses; it is never read as "not
 * needed". Existence is proven again by the fetch that follows.
 */
export declare function verifyTaskBase(root: string, base: string, gh?: CommandRunner): Promise<TrunkRef | null>;
