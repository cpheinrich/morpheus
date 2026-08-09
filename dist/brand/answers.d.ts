import type { BrandAnswers } from "./questions.js";
/**
 * Where the owner's answers live: `hq/brand/answers.md`.
 *
 * One file, editable directly or fillable by the wizard. Earlier versions kept
 * a JSON record beside the prose and that was a second source of truth by
 * another name — the thing this package spends most of its effort avoiding
 * everywhere else.
 */
export declare const ANSWERS_FILE = "answers.md";
/** Answers as recorded, or null when the file is absent or incomplete. */
export declare function readAnswers(brandDir: string): Promise<BrandAnswers | null>;
/** Answers plus every reason they did not parse, for the commands that report. */
export declare function readAnswersDetailed(brandDir: string): Promise<{
    answers: BrandAnswers | null;
    issues: string[];
    exists: boolean;
}>;
/**
 * Write the editable file, prefilled with whatever is known.
 *
 * Always overwrites. It is a rendering of the answers, and the answers are the
 * thing being changed — preserving a stale copy would defeat the point.
 */
export declare function writeAnswers(brandDir: string, name: string, answers?: Partial<BrandAnswers> | null): Promise<string>;
