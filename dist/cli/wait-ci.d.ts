import { type GhRunner } from "../wait-ci/index.js";
export declare const DEFAULT_TIMEOUT = "45m";
export interface WaitCiFlags {
    target?: string;
    extra: string[];
    repo?: string;
    timeout?: string;
    requiredOnly: boolean;
}
/** `gh` as a child process that never throws: a non-zero exit is data the loop decides about. */
export declare const ghRunner: GhRunner;
/** `morpheus wait-ci` — block once on a PR's checks and print the digest. */
export declare function waitCiCommand(flags: WaitCiFlags, gh?: GhRunner): Promise<number>;
