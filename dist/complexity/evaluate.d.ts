import type { ChangedFile } from "./diff.js";
import { type ComplexityConfig } from "./policy.js";
export interface FunctionRow {
    name: string;
    longName: string;
    start: number;
    end: number;
    ccn: number;
    cognitive: number | null;
    nloc: number;
}
export interface FileResult {
    path: string;
    status: "measured" | "unsupported" | "unmeasured" | "skipped";
    error?: string;
    directives?: {
        line: number;
        text: string;
    }[];
    functions?: FunctionRow[];
}
export type Severity = "error" | "warning" | "note";
export interface Finding {
    rule: string;
    severity: Severity;
    path?: string;
    line?: number;
    message: string;
}
/** `all` measures every function in the file; a ChangedFile only the ones its changes touch. */
export type Target = ChangedFile | "all";
export interface Evaluation {
    findings: Finding[];
    targeted: number;
    inTouchedFiles: number;
    measuredFiles: number;
}
/** Code outside every function is Lizard's `*global*` row; Evo's baseline scores it too. */
export declare function isTouched(fn: FunctionRow, target: Target, all: FunctionRow[]): boolean;
export type Scope = "changed" | "all";
export declare function evaluate(config: ComplexityConfig, results: FileResult[], targets: Map<string, Target>, scope?: Scope): Evaluation;
/**
 * An exception is judged only where its file was analysed in this run; in a
 * targeted run an untouched file's exception is "not evaluated", never stale.
 * A run over every file (`all`) has seen the whole tree, so an exception whose
 * in-scope file is not there (deleted or renamed) is stale: left in place it
 * would silently cover a later file recreated at that path.
 */
export declare function exceptionFindings(config: ComplexityConfig, results: FileResult[], targets: Map<string, Target>, scope?: Scope): Finding[];
/** Advisory never blocks: its errors are reported as warnings. */
export declare function applyMode(config: ComplexityConfig, findings: Finding[]): Finding[];
