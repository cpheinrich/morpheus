export interface BrandInitOptions {
    brandDir: string;
    name: string;
    prefix: string;
    /** Prefill from previously recorded answers and regenerate derived files. */
    refresh?: boolean;
}
/**
 * Report which generated files no longer follow from `answers.md`.
 *
 * Writes nothing and asks nothing, so it is safe in CI. Exits non-zero on any
 * drift — a package whose prose disagrees with its own answers is wrong even
 * though every file is present.
 */
export declare function check(opts: {
    brandDir: string;
    name: string;
    prefix: string;
}): Promise<number>;
/**
 * Walk the brand questions and write the package.
 *
 * Validation happens once at the end rather than per-question, so a wrong
 * answer late does not discard everything typed before it.
 */
export declare function init(opts: BrandInitOptions): Promise<number>;
/**
 * Generate from the edited file, asking nothing.
 *
 * The other half of `init`: the wizard is one way to fill `answers.md`, and
 * this is the path for people who filled it in an editor. Both end in the same
 * place because there is only one place the answers live.
 */
export declare function build(opts: {
    brandDir: string;
    name: string;
    prefix: string;
}): Promise<number>;
