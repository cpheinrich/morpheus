import {
  formatMorpheusInstallStatus,
  installCurrentMorpheus,
  morpheusInstallStatus,
  updateMorpheus,
} from "../self.js";
import {
  autoUpdateStatus,
  disableAutoUpdate,
  enableAutoUpdate,
  ensureAutoUpdate,
  type AutoUpdateChange,
  type EnsureResult,
} from "../self-auto-update.js";

export async function check(offline: boolean): Promise<number> {
  const status = await morpheusInstallStatus({ offline });
  console.log(formatMorpheusInstallStatus(status));
  return status.fresh === true ? 0 : 1;
}

export async function install(source: string): Promise<number> {
  try {
    const result = await installCurrentMorpheus(source);
    console.log(
      `Installed Morpheus ${result.commit.slice(0, 7)} as a standalone global package.\n` +
        `Source checkout left unchanged: ${source}`,
    );
    return 0;
  } catch (error) {
    console.error(`Could not install Morpheus: ${(error as Error).message}`);
    return 1;
  }
}

export async function update(): Promise<number> {
  try {
    const result = await updateMorpheus();
    console.log(
      `Updated Morpheus to current main ${result.commit.slice(0, 7)}.\n` +
        "The disposable checkout was removed; no working repository was changed.",
    );
    return 0;
  } catch (error) {
    console.error(`Could not update Morpheus: ${(error as Error).message}`);
    return 1;
  }
}

function printEnsure(result: EnsureResult, quietCurrent = false): void {
  if (quietCurrent && result.outcome === "current") return;
  const mark =
    result.outcome === "updated" || result.outcome === "current"
      ? "✓"
      : result.outcome === "failed"
        ? "✗"
        : "~";
  const output = result.outcome === "failed" ? console.error : console.log;
  output(`${mark} ${result.detail}`);
}

function printAutoUpdate(change: AutoUpdateChange): number {
  console.log(`Morpheus auto-update: ${change.config.preference} (${change.config.path})`);
  for (const repair of change.hooks) {
    const mark = repair.outcome === "blocked" ? "✗" : repair.outcome === "absent" ? "~" : "✓";
    console.log(`${mark} ${repair.root} · ${repair.hook} — ${repair.detail}`);
  }
  if (change.ensure) printEnsure(change.ensure);
  return change.hooks.some((repair) => repair.outcome === "blocked") ||
    change.ensure?.outcome === "failed"
    ? 1
    : 0;
}

/** Called by managed Git hooks. Current is deliberately silent. */
export async function ensure(): Promise<number> {
  const result = await ensureAutoUpdate();
  printEnsure(result, true);
  return result.outcome === "failed" ? 1 : 0;
}

export async function autoUpdate(action: string | undefined, root: string): Promise<number> {
  try {
    if (action === "enable") return printAutoUpdate(await enableAutoUpdate(root));
    if (action === "disable") return printAutoUpdate(await disableAutoUpdate(root));
    if (action === "status" || action === undefined) {
      return printAutoUpdate(await autoUpdateStatus(root));
    }
  } catch (error) {
    console.error(`Could not ${action ?? "inspect"} Morpheus auto-update: ${(error as Error).message}`);
    return 1;
  }
  console.error(`Unknown auto-update command "${action}". Use enable, disable, or status.`);
  return 1;
}
