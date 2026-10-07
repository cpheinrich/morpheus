/**
 * An explicit "someone is using this simulator" signal for the idle watchdog.
 *
 * The watchdog measures activity from writes inside user-installed apps, which is the right signal
 * for an app that is being exercised but a blind one for a person (or an agent) who is only
 * looking: scrolling a list writes nothing. Tools that drive a simulator themselves — today the QA
 * overlay, on every touch and key it forwards — call `recordSimulatorActivity`, and the watchdog
 * reads the file's mtime. Nothing else depends on the file, and a failure to write it must never
 * reach the person driving the device.
 */
export declare const ACTIVITY_THROTTLE_MS = 60000;
export declare function activityDir(): string;
/** The heartbeat file for a device, or null for anything that is not a simulator UDID. */
export declare function activityPath(udid: string, dir?: string): string | null;
/** Returns whether it wrote. Never throws. */
export declare function recordSimulatorActivity(udid: string, now?: number, dir?: string): boolean;
/** Test seam: forget the throttle so one test's heartbeat cannot suppress another's. */
export declare function resetActivityThrottle(): void;
