import type { Routed } from "./sweep.js";
/**
 * The run digest: one comment on the repository's log issue per run.
 *
 * The per-pull-request comments carry the reasoning; this is the index over
 * them, and the place a pattern shows up — the same pull request skipped for
 * the same reason run after run is a finding about the process, not the PR.
 */
export interface Outcome {
    number: number;
    /** What was finally done, after the plan was checked. */
    verdict: string;
    /** Set when the plan differed from what the session asked for. */
    overridden?: string | undefined;
    /** Operations that were carried out, in order. */
    did: string[];
    /** Set when carrying the plan out failed part-way. */
    error?: string | undefined;
}
export declare function renderDigest(opts: {
    repo: string;
    runUrl: string;
    at: Date;
    routed: Routed[];
    outcomes: Outcome[];
}): string;
