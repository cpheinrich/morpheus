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
 * - a `begin` while a finger is already down first ends that finger;
 * - a `move` with no finger down is ignored.
 */
export const DEFAULT_MIN_HOLD_MS = 40;
export const DEFAULT_ORPHAN_GRACE_MS = 120;
export class TouchPacer {
    send;
    queue = [];
    minHoldMs;
    orphanGraceMs;
    now;
    schedule;
    cancel;
    down = false;
    downAt = 0;
    waiting = false;
    orphan = null;
    dropped = 0;
    constructor(send, options = {}) {
        this.send = send;
        this.minHoldMs = options.minHoldMs ?? DEFAULT_MIN_HOLD_MS;
        this.orphanGraceMs = options.orphanGraceMs ?? DEFAULT_ORPHAN_GRACE_MS;
        this.now = options.now ?? (() => Date.now());
        this.schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
        this.cancel = options.cancel ?? ((handle) => clearTimeout(handle));
    }
    /** Ends dropped because no begin ever arrived for them. */
    get droppedEnds() {
        return this.dropped;
    }
    push(event) {
        if (event.type === "end" && !this.down && !this.waiting && this.queue.length === 0) {
            // Possibly reordered: hold it for the begin that should have come first.
            if (this.orphan) {
                this.cancel(this.orphan.timer);
                this.dropped += 1;
            }
            const timer = this.schedule(() => {
                this.orphan = null;
                this.dropped += 1;
            }, this.orphanGraceMs);
            this.orphan = { event, timer };
            return;
        }
        if (event.type === "begin" && this.orphan) {
            const orphan = this.orphan;
            this.orphan = null;
            this.cancel(orphan.timer);
            this.queue.push(event, orphan.event);
        }
        else {
            this.queue.push(event);
        }
        this.pump();
    }
    pump() {
        while (!this.waiting) {
            const event = this.queue.shift();
            if (!event)
                return;
            if (event.type === "begin") {
                if (this.down)
                    this.send({ type: "end", x: event.x, y: event.y });
                this.send(event);
                this.down = true;
                this.downAt = this.now();
                continue;
            }
            if (event.type === "move") {
                if (this.down)
                    this.send(event);
                continue;
            }
            if (!this.down) {
                this.dropped += 1;
                continue;
            }
            const wait = this.minHoldMs - (this.now() - this.downAt);
            if (wait > 0) {
                this.waiting = true;
                this.schedule(() => {
                    this.send(event);
                    this.down = false;
                    this.waiting = false;
                    this.pump();
                }, wait);
                return;
            }
            this.send(event);
            this.down = false;
        }
    }
}
//# sourceMappingURL=touch-pacer.js.map