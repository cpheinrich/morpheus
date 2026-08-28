import {
  codebaseMemoryStatus,
  formatCodebaseMemoryStatus,
  installCodebaseMemory,
} from "../codebase-memory.js";

export async function install(root: string, check: boolean): Promise<number> {
  if (check) {
    const status = await codebaseMemoryStatus(root);
    console.log(formatCodebaseMemoryStatus(status));
    if (!status.ready) {
      console.log("\nRun `morpheus codebase-memory install` on this trusted device.");
      if (status.morpheusFresh === false) {
        console.log("First run `morpheus self update`; it does not touch active source work.");
      }
    }
    return status.ready ? 0 : 1;
  }

  const result = await installCodebaseMemory(root);
  console.log(formatCodebaseMemoryStatus(result.status, result.installerWarning));
  if (result.status.ready) {
    console.log(
      result.changed
        ? "\nOperational. Restart active coding-agent sessions so newly written MCP configuration is loaded."
        : "\nAlready operational; nothing changed.",
    );
    return 0;
  }
  console.log("\nCould not reach operational mode. Resolve the findings above, then run --check.");
  if (result.status.morpheusFresh === false) {
    console.log("Run `morpheus self update`; it does not touch active source work.");
  }
  return 1;
}
