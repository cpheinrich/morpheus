import { type WaitDeps, type WaitResult } from "./wait.js";
/**
 * `morpheus wait-ci --run <id>` and `--workflow <name|file>`: the same one
 * quiet blocking call as the pull-request mode, for the runs no pull request
 * owns — TestFlight, release and nightly workflows, which agents otherwise
 * watched with `gh run view <id> --json status,conclusion,jobs` every minute.
 */
export interface RunWaitOptions {
    /** A run's database id: wait for exactly this run. */
    run?: string;
    /** A workflow name or file: wait for its latest matching run. */
    workflow?: string;
    branch?: string;
    sha?: string;
    repo?: string;
    timeoutMs: number;
}
/**
 * How long a latest run that had already finished — found by workflow and
 * branch, not pinned by `--sha` — is held before it is reported. A run just
 * dispatched or pushed is listed within seconds; returning the previous run's
 * verdict at once hands an agent chaining on the exit code someone else's
 * result. Inside the window a newer run is followed like any other move.
 */
export declare const ALREADY_COMPLETE_SETTLE_MS = 20000;
/** `ci.yml on main @ abc1234` — what was asked for, for the messages that have no run to name. */
export declare function describeWanted(opts: RunWaitOptions): string;
/**
 * Wait for one Actions run to complete, then digest it.
 *
 * By id, the run is fixed and a rerun of it is still it. By workflow, every
 * poll re-selects the newest matching run, so a push or dispatch that starts a
 * newer run mid-wait is followed and named — the same rule the pull-request
 * mode applies to a moved head. A workflow that has no matching run yet gets
 * the same grace as a pull request with no checks yet.
 */
export declare function waitRun(deps: WaitDeps, opts: RunWaitOptions): Promise<WaitResult>;
