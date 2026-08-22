import { codebaseMemoryStatus, formatCodebaseMemoryStatus, installCodebaseMemory, } from "../codebase-memory.js";
export async function install(root, check) {
    if (check) {
        const status = await codebaseMemoryStatus(root);
        console.log(formatCodebaseMemoryStatus(status));
        if (!status.ready) {
            console.log("\nRun `morpheus codebase-memory install` on this trusted device.");
            if (status.morpheusFresh === false) {
                console.log(`First update the linked Morpheus checkout at ${status.morpheusSource}.`);
                console.log("Use a clean main clone and `git pull --ff-only`; do not rewrite active work.");
            }
        }
        return status.ready ? 0 : 1;
    }
    const result = await installCodebaseMemory(root);
    console.log(formatCodebaseMemoryStatus(result.status, result.installerWarning));
    if (result.status.ready) {
        console.log(result.changed
            ? "\nOperational. Restart active coding-agent sessions so newly written MCP configuration is loaded."
            : "\nAlready operational; nothing changed.");
        return 0;
    }
    console.log("\nCould not reach operational mode. Resolve the findings above, then run --check.");
    if (result.status.morpheusFresh === false) {
        console.log(`Update the linked Morpheus checkout at ${result.status.morpheusSource}.`);
        console.log("Use a clean main clone and `git pull --ff-only`; do not rewrite active work.");
    }
    return 1;
}
//# sourceMappingURL=codebase-memory.js.map