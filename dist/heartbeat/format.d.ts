import type { Beat } from "./assess.js";
export declare function formatBeat(beat: Beat): string;
/** The GitHub Actions job summary — the durable record of a scheduled beat. */
export declare function formatSummary(beat: Beat): string;
