export interface ProfileFlags {
    since?: string;
    repo?: string;
    out?: string;
    json?: boolean;
}
/** `morpheus profile extract` — JSONL rows to `--out` or stdout. */
export declare function profileExtract(flags: ProfileFlags): Promise<number>;
/** `morpheus profile report` — the human summary, or `--json`. */
export declare function profileReport(flags: ProfileFlags): Promise<number>;
