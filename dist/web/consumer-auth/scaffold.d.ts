import type { WebSurvey } from "../survey.js";
import type { ConsumerAuthContext } from "./context.js";
/**
 * Write consumer accounts into a project that already ran `morpheus web init`
 * — cpheinrich/morpheus#135, extracted from Evo (darwin-health/evo#58, #62).
 *
 * **Never overwrites**, the same contract as `web init`. The consequence is
 * sharper here, because several files are the *consumer* versions of files
 * `web init` writes in an HQ-only shape — the session route that authenticates
 * without authorising, the two-branch route gate, the two-environment Firebase
 * config. Where one of those exists and differs from this scaffold's version
 * it is reported as **drift**, with the same recovery `web init` prescribes
 * for its own stale files: if the file is unedited scaffold output, delete it
 * and re-run; if it carries local edits, fold the template's changes in by
 * hand (`--check` names each drifted file). Overwriting would be simpler, and
 * would silently destroy exactly the edits that matter.
 *
 * Layers, from the extraction (#135):
 *   A — plumbing, copied verbatim with placeholders (lib/, the shared schema)
 *   B — codified policy (the API routes, the route gate, the rules block)
 *   C — starter surfaces the project owns after scaffold (pages, CSS)
 *   D — the contract: the three suites travel with the scaffold
 *
 * `--check` diffs layers A and B against the current templates. C is excluded
 * because the project owns it; D because projects extend the suites in place,
 * and flagging every added spec as drift would train people to ignore the
 * report.
 */
export type Layer = "plumbing" | "policy" | "starter" | "contract";
export interface PlannedFile {
    /** Repository-relative path. */
    path: string;
    content: string;
    layer: Layer;
}
export interface ConsumerAuthOptions {
    root: string;
    survey: WebSurvey;
    ctx: ConsumerAuthContext;
}
export interface ConsumerAuthResult {
    written: string[];
    skipped: string[];
    merged: string[];
    /** Existing files that differ from the current template. */
    drifted: string[];
    notes: string[];
}
/**
 * Everything the scaffold writes whole, as (path, content, layer).
 *
 * One list shared by the writer and `--check`, so the two cannot disagree
 * about what the current templates say a file should be.
 */
export declare function plannedFiles(survey: WebSurvey, ctx: ConsumerAuthContext): PlannedFile[];
export declare function scaffoldConsumerAuth(opts: ConsumerAuthOptions): Promise<ConsumerAuthResult>;
/**
 * `--check`: layers A and B against the current templates.
 *
 * The same regeneration philosophy as `morpheus hq rules --check`: the report
 * says which shared files have drifted from what the templates now say, and
 * exits non-zero so CI can hold a project to it if it chooses.
 */
export declare function checkConsumerAuth(opts: ConsumerAuthOptions): Promise<number>;
/** Root scripts, written so a local run and a CI run are the same line. */
export declare function rootScriptSet(survey: WebSurvey, ctx: ConsumerAuthContext): Record<string, string>;
/**
 * Add missing entries to one object field of a JSON manifest.
 *
 * Only ever adds, the same contract as `mergeDependencies`: a value the
 * project already has is the project's decision.
 */
export declare function mergeJson(path: string, field: "scripts" | "devDependencies", required: Record<string, string>): Promise<string[]>;
type RulesOutcome = {
    kind: "merged";
    path: string;
} | {
    kind: "note";
    message: string;
} | {
    kind: "none";
};
/**
 * Insert the consumer-accounts block into the deployed rules, above the
 * catch-all — the same anchored merge as the waitlist block, for the same
 * reason: rules are a security boundary, and writing into one at a guessed
 * position is how a `match` lands outside the scope it was meant for.
 */
export declare function addConsumerRules(root: string, rulesPath: string | null): Promise<RulesOutcome>;
type FirebaseJsonOutcome = {
    kind: "written";
} | {
    kind: "merged";
} | {
    kind: "note";
    message: string;
} | {
    kind: "none";
};
/**
 * Make sure `firebase.json` declares the emulators the suites depend on.
 *
 * Ports are load-bearing: the rules suite dials a literal 127.0.0.1:8080, so
 * an existing emulators block is left alone and *reported* when its ports
 * disagree — rewriting a project's ports would break whatever chose them.
 */
export declare function ensureEmulatorsBlock(root: string, rulesPath: string | null): Promise<FirebaseJsonOutcome>;
/**
 * Add `./schema/user` to the shared package's explicit exports map — the
 * whitelist that silently makes a file unimportable is worth checking before
 * concluding a pipeline is broken, and this is that check done at write time.
 */
export declare function addSharedUserExport(root: string): Promise<boolean>;
export {};
