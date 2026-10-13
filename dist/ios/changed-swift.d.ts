/**
 * `morpheus ios changed-swift` — the Swift files a change touched.
 *
 * A thin way to reach `scripts/swift-changed-files.sh`, which is the same file
 * `ios-ci.yml` runs through its composite action. The point is not the
 * convenience: it is that a consumer wanting this check locally has one
 * implementation to call rather than a workflow step to imitate. The first
 * consumer that imitated it drifted inside a single commit, in two ways that
 * each made a local "clean" that CI contradicted (darwin-health/evo#281).
 *
 * Thin on purpose. Base-ref policy belongs to the caller: what CI compares
 * (a commit and its first parent) and what a developer compares (the merge base
 * with a trunk, plus work not committed yet) are different questions, and this
 * passes both through rather than choosing.
 */
export interface ChangedSwiftOptions {
    workingDirectory: string;
    base?: string;
    worktree?: boolean;
    /** NUL-delimited, for `xargs -0` and shell arrays; newlines are for reading. */
    nul?: boolean;
}
/**
 * Where the shared script is, whether Morpheus is installed as a package or
 * checked out. `dist/ios/changed-swift.js` and `src/ios/changed-swift.ts` are
 * both two levels below the root, so one relative path serves both.
 */
export declare function scriptPath(moduleUrl?: string): string;
export declare function changedSwiftArguments(options: ChangedSwiftOptions): string[];
export declare function run(options: ChangedSwiftOptions, cwd?: string): number;
