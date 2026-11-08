import { lstatSync } from "node:fs";
import { join } from "node:path";

const name = "morpheus_context";
const pin = "MORPHEUS_CONTEXT_WORKTREE_PIN";
const server = { command: "morpheus", args: ["context", "mcp"], env: { [pin]: "1" } };

export function contextMcpArgs(cwd, worker) {
  if (!cwd || !lstatSync(join(cwd, "morpheus.json"), { throwIfNoEntry: false })?.isFile()) return [];
  if (worker === "claude") {
    return ["--mcp-config", JSON.stringify({ mcpServers: { [name]: server } })];
  }
  const { command, args } = server;
  return Object.entries({ command, args, [`env.${pin}`]: server.env[pin], cwd }).flatMap(([key, value]) => [
    "-c", `mcp_servers.${name}.${key}=${JSON.stringify(value)}`,
  ]);
}
