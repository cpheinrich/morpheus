/**
 * Environment for a git subprocess that must operate on the repository at its
 * `cwd`, not on whichever repository invoked Morpheus.
 *
 * Git exports `GIT_DIR` (and, depending on the operation, `GIT_INDEX_FILE`,
 * `GIT_PREFIX`, `GIT_WORK_TREE`, …) into every hook it runs. A child `git`
 * honours those over its working directory, so the managed `post-merge` hook's
 * `morpheus self ensure` ran `git status` inside its disposable Morpheus clone
 * against the *project's* repository and index, and refused with "the source
 * checkout has local changes" while every checkout involved was clean.
 *
 * The list is Git's own repository-local set (`git rev-parse --local-env-vars`,
 * the variables Git itself clears before entering a submodule) minus the
 * `GIT_CONFIG*` entries, plus `GIT_NAMESPACE`. Configuration is deliberately
 * kept: CI injects credentials and `safe.directory` through
 * `GIT_CONFIG_COUNT`/`GIT_CONFIG_PARAMETERS`, and config cannot redirect a
 * command to another repository — these variables can.
 */
export const REPOSITORY_LOCAL_GIT_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NAMESPACE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
] as const;

/** Git's repository-local variables that are kept on purpose; see above. */
export const KEPT_GIT_CONFIG_ENV = ["GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"] as const;

/** A copy of `env` with every repository-locating Git variable removed. */
export function gitSubprocessEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...env };
  for (const name of REPOSITORY_LOCAL_GIT_ENV) delete clean[name];
  return clean;
}
