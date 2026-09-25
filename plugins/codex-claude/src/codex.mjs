import WebSocket from "ws";
import net from "node:net";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
const exec = promisify(execFile);
export class Codex extends EventEmitter {
  pending = new Map();
  sequence = 0;
  async connect() {
    const { stdout } = await exec(
      "codex",
      ["app-server", "daemon", "version"],
      { timeout: 10000 },
    );
    const info = JSON.parse(stdout);
    if (info.status !== "running" || !info.socketPath)
      throw new Error(
        "A running local Codex app server is required on this execution host.",
      );
    this.ws = new WebSocket("ws://localhost/", {
      createConnection: () => net.connect(info.socketPath),
      perMessageDeflate: false,
      handshakeTimeout: 10000,
      maxPayload: 8 * 1024 * 1024,
    });
    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.error
          ? p.reject(new Error(msg.error.message))
          : p.resolve(msg.result);
      } else if (msg.method) this.emit("notification", msg);
    });
    this.ws.on("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Codex disconnected"));
      }
      this.pending.clear();
      this.emit("disconnected");
    });
    this.ws.on("error", () => {});
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    await this.call("initialize", {
      clientInfo: { name: "morpheus_claude_bridge", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.ws.send(JSON.stringify({ method: "initialized", params: {} }));
    return this;
  }
  call(method, params = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("Codex not connected"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async snapshot(id) {
    const { thread } = await this.call("thread/read", { threadId: id });
    if (thread.status?.type === "notLoaded") return recordedSnapshot(thread);
    // Resume attaches to the loaded session without configuration overrides or starting a turn.
    const live = await this.call("thread/resume", {
      threadId: id,
      excludeTurns: true,
    });
    return {
      ...thread,
      model: live.model,
      reasoningEffort: live.reasoningEffort,
      cwd: live.cwd,
      sandbox: live.sandbox,
      approvalPolicy: live.approvalPolicy,
    };
  }
  close() {
    this.ws?.close();
  }
}

// Version-gated fallback for Desktop runtimes not attached to the managed daemon.
// Read only turn metadata; never forward the chat transcript or hidden instructions.
export async function recordedSnapshot(thread) {
  if (
    !["0.154.0", "0.154.0-alpha.6.1"].includes(thread.cliVersion) ||
    !thread.path
  )
    throw new Error(
      "Unsupported Desktop metadata adapter; run doctor after updating Codex.",
    );
  let context = null,
    active = null;
  const stream = createReadStream(thread.path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (r.type === "turn_context") context = r;
      if (r.type === "event_msg" && r.payload?.type === "task_started")
        active = r.payload.turn_id;
      if (
        r.type === "event_msg" &&
        ["task_complete", "turn_aborted"].includes(r.payload?.type) &&
        (!r.payload.turn_id || r.payload.turn_id === active)
      )
        active = null;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  const p = context?.payload;
  if (
    !p ||
    !active ||
    p.turn_id !== active ||
    Date.now() - Date.parse(context.timestamp) > 24 * 3600000
  )
    throw new Error(
      "No active, verified turn settings; open the task and send a message.",
    );
  if (
    p.permission_profile?.type !== "disabled" ||
    p.sandbox_policy?.type !== "danger-full-access"
  )
    throw new Error(
      "Recorded restricted permissions are not supported; delegation refused.",
    );
  return {
    ...thread,
    cwd: p.cwd,
    model: p.model,
    reasoningEffort: p.effort,
    approvalPolicy: p.approval_policy,
    sandbox: { type: "dangerFullAccess" },
    turnId: p.turn_id,
    settingsSource: "recorded-turn-0.154.0",
  };
}
