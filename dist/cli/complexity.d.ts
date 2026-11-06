export declare function install(check: boolean): Promise<number>;
export interface CheckFlags {
    base?: string;
    all: boolean;
    json: boolean;
    ci: boolean;
}
/**
 * Exit 0 passes (advisory always passes), 1 is a blocking finding in enforce
 * mode, 2 means the check could not run — never a silent pass. In CI an
 * enforcing project is measured in full: a pin move, a removed exclude or a
 * mapping bug changes untouched code too.
 */
export declare function check(root: string, flags: CheckFlags): Promise<number>;
/** The canonical refactoring prompt, shipped beside this module so every installed CLI prints the same text. */
export declare const PROMPT_PATH: URL;
export declare function prompt(): Promise<number>;
