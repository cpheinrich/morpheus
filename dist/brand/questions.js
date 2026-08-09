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
export const BrandAnswers = z.object({
    /** One sentence: what is this? */
    what: z.string().min(10),
    /** What it exists to do. */
    mission: z.string().min(10),
    /** Who specifically — a description, not a demographic bracket. */
    primaryAudience: z.string().min(5),
    /** Who else, if anyone. */
    secondaryAudience: z.string().optional(),
    /** Three adjectives for how it should feel. */
    feels: z.array(z.string().min(2)).min(2).max(5),
    /** What it must never feel or sound like. The guardrail. */
    never: z.array(z.string().min(3)).min(1),
    /** Brands or publications whose feel is a reference point. */
    references: z.array(z.string()).default([]),
    /** Where the visual direction already exists, if anywhere. */
    visualSource: z.string().optional(),
});
export const QUESTIONS = [
    {
        key: "what",
        prompt: "In one sentence, what is this?",
        why: "Everything else is derived from this. If it takes two sentences, the thing is not scoped yet.",
        example: "Free consumer health tools for people taking GLP-1 medication.",
    },
    {
        key: "mission",
        prompt: "What does it exist to do?",
        why: "The 'what' describes it; this says why anyone should care. They are different sentences.",
        example: "Earn trust through genuine utility before there is anything to sell.",
    },
    {
        key: "primaryAudience",
        prompt: "Who is it for, specifically?",
        why: "A description beats a demographic. 'Women 35-55' tells an agent nothing it can write for.",
        example: "People three months into a GLP-1 prescription, losing weight but worried about muscle.",
    },
    {
        key: "secondaryAudience",
        prompt: "Anyone else? (enter to skip)",
        why: "Only if genuinely distinct — a second audience you would write differently for.",
        optional: true,
    },
    {
        key: "feels",
        prompt: "Three adjectives for how it should feel:",
        why: "These become the test applied to every design and copy decision.",
        list: true,
        example: "calm / evidence-led / unfussy",
    },
    {
        key: "never",
        prompt: "What must it never feel or sound like?",
        why: "The most useful answer here. Positioning drifts because nobody wrote down the boundary, and an agent cannot infer it from what the thing is.",
        list: true,
        example: "wellness-influencer / clinical-cold / hustle-culture",
    },
    {
        key: "references",
        prompt: "Brands or publications whose feel you admire? (enter to skip)",
        why: "Gives an agent something concrete to aim at when a rule is ambiguous.",
        list: true,
        optional: true,
    },
    {
        key: "visualSource",
        prompt: "Does a visual direction already exist somewhere? (path or URL, enter to skip)",
        why: "If the live site is already the decided direction, tokens should be derived from it rather than invented.",
        optional: true,
    },
];
//# sourceMappingURL=questions.js.map