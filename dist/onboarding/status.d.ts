import { type TaskStatus } from "./state.js";
/**
 * Combine what can be seen with what was recorded.
 *
 * Detection wins wherever it has an answer. Where it does not — no `gh`, no
 * network, a task that lives entirely in someone else's console — the recorded
 * state stands.
 *
 * The one case worth being careful about is detection returning `null`. That
 * means *could not check*, and it must not collapse into "not done": a missing
 * tool would then render as an incomplete setup, which sends people to fix
 * something that was never broken.
 */
export interface StatusOptions {
    /** Skip detectors that need the network. */
    offline?: boolean;
}
export declare function collectStatus(root: string, opts?: StatusOptions): Promise<TaskStatus[]>;
export interface Summary {
    requiredTotal: number;
    requiredDone: number;
    optionalDone: number;
    optionalTotal: number;
    unknown: number;
    complete: boolean;
}
export declare function summarise(statuses: TaskStatus[]): Summary;
export declare function formatStatus(statuses: TaskStatus[], name: string, path: string): string;
