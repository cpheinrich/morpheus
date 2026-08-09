/**
 * One beat.
 *
 * Read, assess, propose, stop. It is a **dispatcher, not a doer** — doing the
 * work inside a beat puts an unattended agent on a timer, which is a much
 * larger decision than scheduling one, and one Chris has explicitly deferred.
 */
/** Dispatch was asked for and refused. Distinct from "nothing to do". */
export declare const EXIT_REFUSED = 2;
export interface HeartbeatOptions {
    productDir: string;
    cwd: string;
    ceiling?: number;
    json?: boolean;
    dispatch?: boolean;
}
export declare function heartbeat(opts: HeartbeatOptions): Promise<number>;
