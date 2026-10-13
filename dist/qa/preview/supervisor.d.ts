import { type ChildProcess } from "node:child_process";
/**
 * The launchd job for one preview: serve-sim, then the comment overlay on top of it.
 *
 * A preview survives its launching terminal but never owns a booted device past its lease. The
 * overlay lives in this process rather than beside it, so the lease, `stop` and an expiry end both
 * together — before this, the overlay was a second process the agent had to remember to stop.
 */
export declare function supervise(child: ChildProcess, { expired, cleanup, interval, grace, signals }: {
    expired: () => boolean;
    cleanup: () => Promise<void> | void;
    interval?: number;
    grace?: number;
    signals?: NodeJS.EventEmitter;
}): Promise<number>;
