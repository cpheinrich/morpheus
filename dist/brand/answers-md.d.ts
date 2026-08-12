import { BrandAnswers } from "./questions.js";
/** Render the editable file, prefilled with whatever is already known. */
export declare function renderAnswersMd(name: string, answers?: Partial<BrandAnswers> | null): string;
export interface ParseResult {
    answers: BrandAnswers | null;
    /** Every problem at once — a half-filled file should not report one line at a time. */
    issues: string[];
}
export declare function parseAnswersMd(text: string): ParseResult;
