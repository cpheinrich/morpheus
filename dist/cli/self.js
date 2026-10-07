import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatMorpheusInstallStatus, installCurrentMorpheus, morpheusInstallStatus, updateMorpheus, } from "../self.js";
import { autoUpdateStatus, disableAutoUpdate, enableAutoUpdate, ensureAutoUpdate, findMorpheusBinary, } from "../self-auto-update.js";
const exec = promisify(execFile);
/**
 * Keeps an enabled simulator watchdog pointed at the Morpheus that was just installed. It runs the
 * *installed* binary rather than this process: this process is still the code that was on disk
 * before the update, and would write the old agent definition. A Mac that never enabled the
 * watchdog, or that disabled it, is left alone by `refresh` itself.
 */
async function refreshSimulatorWatchdog() {
    if (process.platform !== "darwin")
        return;
    const binary = await findMorpheusBinary();
    if (!binary)
        return;
    try {
        const { stdout } = await exec(binary, ["simulator", "watchdog", "refresh"], { timeout: 60_000 });
        if (stdout.trim())
            console.log(stdout.trim());
    }
    catch (error) {
        console.error(`~ Simulator watchdog refresh failed: ${(error.message ?? String(error)).split("\n")[0]}`);
    }
}
export async function check(offline) {
    const status = await morpheusInstallStatus({ offline });
    console.log(formatMorpheusInstallStatus(status));
    return status.fresh === true ? 0 : 1;
}
export async function install(source) {
    try {
        const result = await installCurrentMorpheus(source);
        console.log(`Installed Morpheus ${result.commit.slice(0, 7)} as a standalone global package.\n` +
            `Source checkout left unchanged: ${source}`);
        await refreshSimulatorWatchdog();
        return 0;
    }
    catch (error) {
        console.error(`Could not install Morpheus: ${error.message}`);
        return 1;
    }
}
export async function update() {
    try {
        const result = await updateMorpheus();
        console.log(`Updated Morpheus to current main ${result.commit.slice(0, 7)}.\n` +
            "The disposable checkout was removed; no working repository was changed.");
        await refreshSimulatorWatchdog();
        return 0;
    }
    catch (error) {
        console.error(`Could not update Morpheus: ${error.message}`);
        return 1;
    }
}
function printEnsure(result, quietCurrent = false) {
    if (quietCurrent && result.outcome === "current")
        return;
    const mark = result.outcome === "updated" || result.outcome === "current"
        ? "✓"
        : result.outcome === "failed"
            ? "✗"
            : "~";
    const output = result.outcome === "failed" ? console.error : console.log;
    output(`${mark} ${result.detail}`);
}
function printAutoUpdate(change) {
    console.log(`Morpheus auto-update: ${change.config.preference} (${change.config.path})`);
    for (const repair of change.hooks) {
        const mark = repair.outcome === "blocked" ? "✗" : repair.outcome === "absent" ? "~" : "✓";
        console.log(`${mark} ${repair.root} · ${repair.hook} — ${repair.detail}`);
    }
    if (change.ensure)
        printEnsure(change.ensure);
    return change.hooks.some((repair) => repair.outcome === "blocked") ||
        change.ensure?.outcome === "failed"
        ? 1
        : 0;
}
/** Called by managed Git hooks. Current is deliberately silent. */
export async function ensure() {
    const result = await ensureAutoUpdate();
    printEnsure(result, true);
    if (result.outcome === "updated")
        await refreshSimulatorWatchdog();
    return result.outcome === "failed" ? 1 : 0;
}
export async function autoUpdate(action, root) {
    try {
        if (action === "enable") {
            const change = await enableAutoUpdate(root);
            const code = printAutoUpdate(change);
            if (change.ensure?.outcome === "updated")
                await refreshSimulatorWatchdog();
            return code;
        }
        if (action === "disable")
            return printAutoUpdate(await disableAutoUpdate(root));
        if (action === "status" || action === undefined) {
            return printAutoUpdate(await autoUpdateStatus(root));
        }
    }
    catch (error) {
        console.error(`Could not ${action ?? "inspect"} Morpheus auto-update: ${error.message}`);
        return 1;
    }
    console.error(`Unknown auto-update command "${action}". Use enable, disable, or status.`);
    return 1;
}
//# sourceMappingURL=self.js.map