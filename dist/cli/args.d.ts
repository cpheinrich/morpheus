export interface Flags {
    dir: string;
    base: string;
    name?: string;
    prefix?: string;
    check: boolean;
    project?: string;
    domain?: string;
    supportEmail?: string;
    brand?: string;
    account?: string;
    organization?: string;
    vercelTeam?: string;
    stagingProject?: string;
    bucket?: string;
    objectPrefix?: string;
    catalogDir?: string;
    localRoot?: string;
    gcloud?: string;
    provision: boolean;
    waitlist: boolean;
    hq: boolean;
    openBrowser: boolean;
    dryRun: boolean;
    all: boolean;
    offline: boolean;
    /**
     * Whether `--base` was typed, as distinct from carrying its default. Commands
     * whose natural answer is not "compare against the trunk" — `ios
     * changed-swift`, whose CI-shaped mode compares a commit with its first
     * parent — cannot otherwise tell the two apart, and would silently impose
     * `origin/main` on a repository whose trunk has another name or no remote
     * at all.
     */
    baseGiven: boolean;
    /** `ios changed-swift`: include uncommitted and untracked Swift files. */
    worktree: boolean;
    /** `ios changed-swift`: NUL-delimited output, for `xargs -0`. */
    nul: boolean;
    kind?: string;
    owner?: string;
    handle?: string;
    source?: string;
    css?: string;
    ts?: string;
    priority?: string;
    goal?: string;
    slug?: string;
    issue?: string;
    needs?: string;
    context?: string;
    sessionId?: string;
    ceiling?: number;
    notes?: string;
    priorReview?: string;
    beforeCommentId?: string;
    commentId?: string;
    bodyFile?: string;
    prBodyFile?: string;
    selection?: string;
    title?: string;
    authors: string[];
    edition?: string;
    publisher?: string;
    year?: string;
    isbns: string[];
    language?: string;
    rulesPath?: string;
    out?: string;
    full: boolean;
    json: boolean;
    dispatch: boolean;
    print: boolean;
    positional: string[];
}
export declare function parseArgs(argv: string[]): Flags;
