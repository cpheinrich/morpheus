export declare function digest(body: string): string;
export declare function vendored(body: string): string;
/** The compiled core beside this module. Only an installed or built Morpheus has it. */
export declare function coreSource(moduleUrl?: string): string;
export type CheckResult = "current" | "outdated" | "edited" | "not-vendored";
/** Whether a vendored file is intact, and whether it is this Morpheus's core. */
export declare function check(text: string, current: string): CheckResult;
export declare function run(action: string | undefined, file: string | undefined, source?: () => string): number;
