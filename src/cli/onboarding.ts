import { collectStatus, formatStatus, summarise } from "../onboarding/status.js";
import { setState, writeOnboarding, type TaskState } from "../onboarding/state.js";
import { projectKind, projectLabel } from "../onboarding/tasks.js";

/**
 * `morpheus init status` — how far through setup this project is.
 *
 * Always rewrites `hq/onboarding.md`, so the file and the terminal never
 * disagree, and the file is the thing you come back to tomorrow.
 */
export async function status(
  root: string,
  name?: string,
  offline = false,
): Promise<number> {
  const statuses = await collectStatus(root, { offline });
  const label = name ?? (await projectLabel(root));
  const path = await writeOnboarding(root, label, statuses, await projectKind(root));

  console.log(formatStatus(statuses, label, path));
  return 0;
}

/** Mark a manual step done or in progress. */
export async function mark(
  root: string,
  id: string,
  state: TaskState,
  name?: string,
): Promise<number> {
  const statuses = await collectStatus(root, { offline: true });
  const result = setState(statuses, id, state);
  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  const label = name ?? (await projectLabel(root));
  await writeOnboarding(root, label, statuses, await projectKind(root));
  const s = summarise(statuses);
  console.log(
    `\x1b[32m${id} → ${state}\x1b[0m  \x1b[2m${s.requiredDone}/${s.requiredTotal} required\x1b[0m`,
  );
  return 0;
}
