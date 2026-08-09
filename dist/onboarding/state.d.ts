import { type Kind, type Task } from "./tasks.js";
/**
 * The checklist as a file you can edit and be interrupted in the middle of.
 *
 * The pet peeve this exists to fix: a setup wizard is a transaction, so being
 * interrupted at step nine puts you back at step one. Here the state is a
 * markdown file, so closing the terminal costs nothing and the order is yours.
 *
 * Detected tasks are rewritten from reality on every run and their checkboxes
 * are not yours to set — ticking one by hand is undone next time, which is the
 * intended behaviour: the file must not be able to claim something Morpheus can
 * see is untrue. Manual tasks keep whatever you wrote, including notes.
 */
export declare const ONBOARDING_FILE = "hq/onboarding.md";
export type TaskState = "done" | "in-progress" | "todo" | "unknown";
export interface TaskStatus {
    task: Task;
    state: TaskState;
    /** Set by detection rather than by hand. */
    detected: boolean;
    /** Anything the owner wrote under the task. */
    note?: string;
}
export interface Recorded {
    state: TaskState;
    note?: string;
}
/** Read the manual half: whatever the owner set by hand. */
export declare function parseOnboarding(text: string): Map<string, Recorded>;
export declare function renderOnboarding(name: string, statuses: TaskStatus[], kind: Kind): string;
export declare function readOnboarding(root: string): Promise<Map<string, Recorded>>;
export declare function writeOnboarding(root: string, name: string, statuses: TaskStatus[], kind: Kind): Promise<string>;
/** Set a manual task's state, leaving detected ones alone. */
export declare function setState(statuses: TaskStatus[], id: string, state: TaskState): {
    ok: boolean;
    reason?: string;
};
