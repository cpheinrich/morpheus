/**
 * What moved on the base branch since this one left it.
 *
 * **Not `HEAD...base`.** On `pull_request` GitHub checks out
 * `refs/pull/N/merge`, a merge commit whose *first parent is the base tip* —
 * so `merge-base(HEAD, base)` is `base` itself and that diff is empty every
 * time. It would have reported nothing forever and looked like a clean trunk,
 * which is the absent-reads-as-fine shape in the one check meant to catch it.
 *
 * The fork point has to come from the PR **head**: `HEAD^2` on a merge ref,
 * `HEAD` on a normal checkout or a local run.
 */
export declare function trunkChanges(base: string): string[];
export declare function pr(productDir: string, base: string): Promise<number>;
