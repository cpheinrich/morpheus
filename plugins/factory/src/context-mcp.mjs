import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { gitEnv, within } from "./workspace.mjs";

const name = "morpheus_context";
const pin = "MORPHEUS_CONTEXT_WORKTREE_PIN";
const server = { command: "morpheus", args: ["context", "mcp"], env: { [pin]: "1" } };

function hasManifest(root) {
  return lstatSync(join(root, "morpheus.json"), { throwIfNoEntry: false })?.isFile();
}

function morpheusRoot(cwd) {
  if (!cwd) return;
  try {
    if (hasManifest(cwd)) return cwd;
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd, env: gitEnv(), encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root && within(realpathSync(cwd), realpathSync(root)) && hasManifest(root)) return root;
  } catch {
    // An unavailable context server should not prevent launch on an unrelated checkout.
  }
}

export function contextMcpArgs(cwd, worker) {
  const root = morpheusRoot(cwd);
  if (!root) return [];
  if (worker === "claude") {
    return ["--mcp-config", JSON.stringify({ mcpServers: { [name]: server } })];
  }
  const { command, args } = server;
  return Object.entries({ command, args, [`env.${pin}`]: server.env[pin], cwd: root }).flatMap(([key, value]) => [
    "-c", `mcp_servers.${name}.${key}=${JSON.stringify(value)}`,
  ]);
}
