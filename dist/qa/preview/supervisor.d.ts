import { type ChildProcess } from "node:child_process";
/**
 * The launchd job for one preview: serve-sim, then the comment overlay on top of it.
 *
 * A preview survives its launching terminal but never owns a booted device past its lease.
 * The overlay is a child so a native accessibility crash cannot kill the supervisor and stream.
 * The supervisor still owns its lifetime, including lease expiry and explicit stop.
 */
/** Retry one crashed overlay with native accessibility disabled. A second failure stays failed. */
export declare function superviseOverlay(launch: (axEnabled: boolean) => ChildProcess, axEnabled: boolean, log?: (message: string) => void): {
    stop: () => void;
};
export declare function supervise(child: ChildProcess, { expired, cleanup, interval, grace, signals }: {
    expired: () => boolean;
    cleanup: () => Promise<void> | void;
    interval?: number;
    grace?: number;
    signals?: NodeJS.EventEmitter;
}): Promise<number>;
