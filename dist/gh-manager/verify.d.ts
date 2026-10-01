import type { LiveState } from "./decision.js";
/**
 * What lies between the head the sweep saw and the head the session finished on.
 * `trunk-merges` means every commit is a merge of trunk that Git reproduces exactly: nothing
 * was authored. A commit that cannot be read is `unverified`, never `nothing`.
 */
export declare function sessionPushed(root: string, before: string, after: string, trunk: string): LiveState["sessionPushed"];
/**
 * Why `check pr` would refuse the manager's review record at this head, or undefined when it
 * would accept it. Run as though the App had already labelled and cleared this exact head, so
 * what is tested is the record and the diff, which is everything the session controls.
 */
export declare function managerRecordProblem(root: string, body: string, head: string, trunk: string): string | undefined;
