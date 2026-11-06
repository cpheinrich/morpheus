import type { CheckReport } from "./check.js";
/** The human report: the verdict first, then what a reviewer must see, then each finding. */
export declare function formatReport(report: CheckReport): string;
/** GitHub workflow commands. Values are escaped as the runner requires. */
export declare function annotations(report: CheckReport): string[];
/** Markdown for the job summary: the policy delta leads, because it is what a reviewer must not miss. */
export declare function stepSummary(report: CheckReport): string;
/** One short block for the review packet: the real result, or why there is none. */
export declare function packetSummary(report: CheckReport): string;
