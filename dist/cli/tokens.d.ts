/**
 * `morpheus tokens build` — brand tokens to CSS, TypeScript and opt-in Swift.
 *
 * Replaces the script three projects each wrote by hand. Writes nothing when
 * the source has problems: a stylesheet generated from a half-parsed token
 * file is worse than no stylesheet, because the page still renders.
 */
export interface TokensOptions {
    root: string;
    source?: string;
    css?: string;
    ts?: string;
    swift?: string;
    prefix?: string;
    /** Report what would change without writing. */
    check?: boolean;
}
export declare function build(opts: TokensOptions): Promise<number>;
