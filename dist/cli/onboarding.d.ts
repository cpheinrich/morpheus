import { type TaskState } from "../onboarding/state.js";
/**
 * `morpheus init status` — how far through setup this project is.
 *
 * Always rewrites `hq/onboarding.md`, so the file and the terminal never
 * disagree, and the file is the thing you come back to tomorrow.
 */
export declare function status(root: string, name?: string, offline?: boolean): Promise<number>;
/** Mark a manual step done or in progress. */
export declare function mark(root: string, id: string, state: TaskState, name?: string): Promise<number>;
