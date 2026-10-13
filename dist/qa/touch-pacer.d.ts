/**
 * Orders and paces simulator touches before they reach serve-sim's HID socket.
 *
 * The overlay page sends every pointer event as its own HTTP request, so a
 * begin/end pair can reach the server almost together or in the wrong order.
 * serve-sim drops a tap whose begin and end land in the same instant, and an
 * end that arrives before its begin leaves the finger down until the next tap
 * — the "switch flips late, or flips the next control too" QA symptom.
 *
 * The pacer keeps one finger's state and guarantees, in order:
 * - an `end` goes out no sooner than `minHoldMs` after its `begin`;
 * - an `end` with no finger down waits up to `orphanGraceMs` for a late
 *   `begin`, then pairs with it (begin, hold, end) or is dropped;
 * - a `begin` while a finger is already down first ends that finger, with the
 *   same minimum hold;
 * - a `move` with no finger down is ignored.
 */
export type TouchType = "begin" | "move" | "end";
export interface TouchEvent {
    type: TouchType;
    x: number;
    y: number;
}
export interface TouchPacerOptions {
    /** Minimum time between a begin and its end, in ms. */
    minHoldMs?: number;
    /** How long an end with no finger down waits for its begin, in ms. */
    orphanGraceMs?: number;
    now?: () => number;
    schedule?: (fn: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
}
export declare const DEFAULT_MIN_HOLD_MS = 40;
export declare const DEFAULT_ORPHAN_GRACE_MS = 120;
export declare class TouchPacer {
    private readonly send;
    private readonly queue;
    private readonly minHoldMs;
    private readonly orphanGraceMs;
    private readonly now;
    private readonly schedule;
    private readonly cancel;
    private down;
    private downAt;
    private waiting;
    private orphan;
    private dropped;
    constructor(send: (event: TouchEvent) => void, options?: TouchPacerOptions);
    /** Ends dropped because no begin ever arrived for them. */
    get droppedEnds(): number;
    push(event: TouchEvent): void;
    private pump;
}
