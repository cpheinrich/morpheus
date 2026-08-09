import { z } from "zod";
/**
 * The brand wizard's questions.
 *
 * Deliberately few. A brand document full of `TODO` is worse than an empty
 * one, because it looks answered — so every question here must be one the
 * owner can answer in a sentence, and the output must contain no placeholders.
 *
 * The highest-value question is `never`. Positioning drifts because nobody
 * wrote down what the thing must not become, and an agent has no way to infer
 * it from what the thing is.
 */
export declare const BrandAnswers: z.ZodObject<{
    what: z.ZodString;
    mission: z.ZodString;
    primaryAudience: z.ZodString;
    secondaryAudience: z.ZodOptional<z.ZodString>;
    feels: z.ZodArray<z.ZodString>;
    never: z.ZodArray<z.ZodString>;
    references: z.ZodDefault<z.ZodArray<z.ZodString>>;
    visualSource: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BrandAnswers = z.infer<typeof BrandAnswers>;
export interface Question {
    key: keyof BrandAnswers;
    prompt: string;
    /** Shown under the prompt — why this question earns its place. */
    why: string;
    /** Collect repeatedly until an empty line. */
    list?: boolean;
    optional?: boolean;
    example?: string;
}
export declare const QUESTIONS: Question[];
