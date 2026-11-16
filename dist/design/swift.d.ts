import type { Token } from "./tokens.js";
/** Opt-in iOS/macOS palette. Missing dark overrides inherit the light primitive. */
export declare function renderSwift(tokens: Token[], source: string): {
    content: string;
    issues: string[];
};
