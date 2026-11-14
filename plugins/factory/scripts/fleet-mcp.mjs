import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { delegatedMarker, home } from "../src/config.mjs";
import { call } from "../src/client.mjs";
import { codexRootId } from "./codex-root.mjs";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const task = { taskId: z.string().uuid() };
const artifact = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const text = z.string().min(1).max(65536);
const operation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("submit"), project: id, revision: z.string().regex(/^[0-9a-f]{40}$/), text, model: id.optional(), messageId: id }),
  z.object({ op: z.literal("get"), ...task }),
  z.object({ op: z.literal("readiness"), project: id }),
  z.object({ op: z.literal("wait"), ...task }),
  z.object({ op: z.literal("answer"), ...task, attemptId: z.string().uuid(), questionId: id, text, messageId: id }),
  z.object({ op: z.literal("cancel"), ...task }),
  z.object({ op: z.literal("download"), ...task, name: artifact }),
]);

export const fleetControllerPath = () => join(home(), "fleet-controller.json");

export async function fleetOperation(rootId, operation, { seconds, checkoutPath } = {}) {
  if (process.env[delegatedMarker]) throw new Error("Delegated workers cannot use the remote Factory.");
  const { connectFleet, readFleetConfig, waitForFleetTask } = await import("../src/fleet-client.mjs");
  const config = await readFleetConfig(fleetControllerPath());
  const client = await connectFleet(config);
  try {
    const { op, ...input } = operation;
    const body = { ...input, rootId };
    if (op === "submit" || op === "answer") {
      const project = op === "submit" ? input.project : (await client.call("get", { rootId, taskId: input.taskId })).task.source.project;
      const projectPath = config.projects?.[project];
      await call("factory.remoteAuthorize", { rootId, projectPath, checkoutPath });
    }
    let result = op === "wait" ? await waitForFleetTask(client, body, seconds) : await client.call(op, body);
    if (op === "download") {
      const directory = join(home(), "fleet-downloads");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${randomUUID()}-${input.name}`);
      await writeFile(path, Buffer.from(result.bytes, "base64"), { flag: "wx", mode: 0o600 });
      result = { artifact: result.artifact, path };
    }
    return result;
  } finally { await client.close(); }
}

export function registerFleetTool(server) {
  server.registerTool("factory_remote", {
    description: "Use the opt-in remote Studio pilot for an enrolled project and exact commit. Inspect project readiness, submit a bounded brief, wait for a question or completion, answer routine clarifications within user authorization, cancel, or download a result artifact. Supply stable message IDs on submit and answer so retries do not duplicate work. The plugin binds operations to the current Codex root.",
    inputSchema: { operation },
  }, async ({ operation }, extra) => {
    try {
      const rootId = codexRootId(extra);
      const result = await fleetOperation(rootId, operation);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.code === "ENOENT" ? "Remote Factory enrollment is missing on this controller." : error.message }] };
    }
  });
}
