/**
 * Report drift for one project, or every registered project with --all.
 *
 * `offline` defaults to the same declaration everything else reads, because
 * `doctor` now makes one network call per project — a command that was
 * filesystem-only and instant would otherwise block on a 15s `ls-remote`
 * timeout seven times over on a plane, with `MORPHEUS_OFFLINE=1` exported and
 * doing nothing.
 */
export declare function run(cwd: string, all: boolean, offline?: boolean): Promise<number>;
