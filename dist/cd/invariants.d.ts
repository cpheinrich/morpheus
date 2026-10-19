import { type CdState } from "./schema.js";
/** Runs before every commit, including transitions introduced by later controller versions. */
export declare function assertTransition(previous: CdState, next: CdState): void;
