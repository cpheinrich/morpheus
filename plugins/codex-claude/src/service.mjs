import http from "node:http";
import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  open,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import {
  home,
  route,
  remaining,
  modelSelection,
  permissionMode,
} from "./config.mjs";
import {
  atomic,
  initStore,
  configRead,
  configWrite,
  taskRead,
  taskWrite,
  projectIdentity,
  runDir,
  readJSON,
} from "./store.mjs";
import { Codex } from "./codex.mjs";
import { checkClaude, handoff, claudeArgs } from "./claude.mjs";
import { identity, stopOrphan } from "./processes.mjs";
import { Viewer } from "./viewer.mjs";
import { memoryContext, codexMemoryEnabled } from "./memory.mjs";
import { installationId } from "./installation.mjs";

export class Manager {
  runs = new Map();
  codex = null;
  busy = false;
  draining = false;
  viewer = new Viewer(this);
  async client() {
    if (!this.codex) {
      this.codex = await new Codex().connect();
      this.codex.on("disconnected", () => {
        this.codex = null;
      });
    }
    return this.codex;
  }
  async snapshot(id) {
    return (await this.client()).snapshot(id);
  }
  async inspect(id, operation) {
    const config = await configRead();
    const task = await taskRead(id);
    const snapshot = await this.snapshot(id);
    const identity = await projectIdentity(snapshot.cwd);
    Object.assign(task, identity);
    await taskWrite(task);
    let allowance = null;
    try {
      allowance = remaining(
        await (await this.client()).call("account/rateLimits/read"),
      );
    } catch {}
    return {
      task,
      snapshot,
      allowance,
      route: route(config, task, allowance, operation),
    };
  }
  async start(args) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    if (this.busy)
      throw new Error("Another delegation is starting; retry shortly.");
    this.busy = true;
    try {
      const config = await configRead();
      const {
        task,
        snapshot,
        route: decision,
      } = await this.inspect(args.threadId, args.operation);
      if (decision.executor !== "claude") throw new Error(decision.reason);
      // Worktree correction is explicit because Morpheus can move work after the turn starts.
      const identity = await projectIdentity(args.cwd || snapshot.cwd);
      if (identity.project !== task.project)
        throw new Error(
          "Delegation directory must belong to the Codex task repository.",
        );
      task.cwd = identity.cwd;
      task.claudeSession = task.sessions?.[task.cwd] || null;
      const previous = task.runId ? await this.status(task.runId) : null;
      if (previous && !previous.terminal)
        throw new Error(
          "This task already has an active run. Resume monitoring it instead.",
        );
      const continuation =
        previous?.state === "needs_input" || !!previous?.question;
      if (
        continuation &&
        (!["codex", "user"].includes(args.replySource) || !args.replyReason)
      )
        throw new Error(
          "Resuming a question requires replySource and replyReason.",
        );
      const replies =
        continuation && args.replySource === "codex"
          ? task.supervisionReplies + 1
          : 0;
      if (replies > config.maxSupervisionReplies)
        throw new Error("Supervision limit reached. Escalate to the user.");
      const active = [...this.runs.values()].filter((r) => !r.terminal);
      if (active.length >= config.maxConcurrent)
        throw new Error("Delegation concurrency limit reached.");
      if (active.some((r) => r.cwd === task.cwd))
        throw new Error("Another Claude run owns this working directory.");
      // Never launch over an orphan after a service restart. Guardian will expire its lease.
      for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
        /^[0-9a-f-]{36}$/.test(id),
      )) {
        const p = await readJSON(join(runDir(id), "process.json"), null);
        if (p?.state !== "running" && p?.state !== "starting") continue;
        const record = await readJSON(join(runDir(id), "run.json"), null);
        if (
          record &&
          (record.threadId === task.id || record.cwd === task.cwd) &&
          !this.runs.has(id)
        ) {
          await writeFile(join(runDir(id), "cancel"), "recovery", {
            mode: 0o600,
          });
          throw new Error(
            "An interrupted run is being cleaned up. Check status before retrying.",
          );
        }
      }
      const selection = modelSelection(config, snapshot, {
        model: args.model,
        effort: args.effort,
      });
      const permissions = permissionMode(snapshot);
      const { env } = await checkClaude(task.cwd);
      const latestConfig = await configRead();
      const latestTask = await taskRead(task.id);
      if (
        latestConfig.mode === "off" ||
        latestConfig.projects[task.project] === "off" ||
        latestTask.disabled
      )
        throw new Error("Delegation was disabled during preflight");
      if (this.draining)
        throw new Error("Bridge upgrade is in progress; retry afterward.");
      const id = randomUUID();
      const dir = runDir(id);
      await mkdir(dir, { mode: 0o700 });
      task.memoryEnabled =
        config.memorySharing &&
        (await codexMemoryEnabled(await this.client(), task));
      const memories = await memoryContext(config, task, "codex");
      const prompt = await handoff(args.prompt, memories);
      const record = {
        id,
        threadId: task.id,
        cwd: task.cwd,
        host: hostname(),
        selection,
        permissions,
        background: args.background === true,
        createdAt: Date.now(),
        state: "starting",
        terminal: false,
        question: null,
        result: null,
        claudeSession: task.claudeSession,
        replySource: args.replySource,
        replyReason: args.replyReason,
      };
      await atomic(join(dir, "run.json"), record);
      await atomic(join(dir, "job.json"), {
        runId: id,
        argv: claudeArgs(task.claudeSession, selection, permissions),
        cwd: task.cwd,
        prompt,
        background: record.background,
        graceSeconds: config.disconnectGraceSeconds,
        maxRunSeconds: config.maxRunSeconds,
      });
      const guardian = spawn(
        "python3",
        [
          fileURLToPath(new URL("./guardian.py", import.meta.url)),
          join(dir, "job.json"),
        ],
        { env, stdio: ["pipe", "ignore", "pipe"], detached: true },
      );
      const run = {
        ...record,
        guardian,
        offset: 0,
        partial: "",
        decoder: new StringDecoder("utf8"),
        progress: "",
        sequence: 0,
        lastLease: Date.now(),
        grace: config.disconnectGraceSeconds * 1000,
      };
      this.runs.set(id, run);
      guardian.stdin.on("error", () => {});
      guardian.stderr.on("data", () => {});
      guardian.on("error", (e) => {
        run.error = e.message;
        run.state = "failed";
        run.terminal = true;
        run.guardianExited = true;
      });
      guardian.on("exit", () => {
        run.guardianExited = true;
      });
      task.runId = id;
      task.supervisionReplies = replies;
      await taskWrite(task);
      run.timer = setInterval(
        () =>
          this.tick(run).catch((e) => {
            run.error = e.message;
            this.cancel(id).catch(() => {});
          }),
        250,
      );
      this.send(run, { type: "heartbeat" });
      return this.public(run);
    } finally {
      this.busy = false;
    }
  }
  send(run, message) {
    if (!run.guardian.stdin.destroyed)
      run.guardian.stdin.write(JSON.stringify(message) + "\n");
  }
  async tick(run) {
    if (run.ticking) return;
    run.ticking = true;
    try {
      if (
        !run.terminal &&
        (run.background || Date.now() - run.lastLease < run.grace)
      )
        this.send(run, { type: "heartbeat" });
      let file;
      try {
        file = await open(join(runDir(run.id), "events.jsonl"), "r");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (file) {
        try {
          const buffer = Buffer.alloc(65536);
          const { bytesRead } = await file.read(
            buffer,
            0,
            buffer.length,
            run.offset,
          );
          run.offset += bytesRead;
          run.partial += run.decoder.write(buffer.subarray(0, bytesRead));
          if (run.partial.length > 4 * 1024 * 1024)
            throw new Error("Claude emitted an oversized event");
          let end;
          while ((end = run.partial.indexOf("\n")) >= 0) {
            const line = run.partial.slice(0, end);
            run.partial = run.partial.slice(end + 1);
            if (line.trim()) await this.event(run, JSON.parse(line));
          }
        } finally {
          await file.close();
        }
      }
      const processState = await readJSON(
        join(runDir(run.id), "process.json"),
        null,
      );
      if (run.guardianExited && processState?.state === "running") {
        if (!(await stopOrphan(processState))) {
          run.state = "cleanup_pending";
          run.error = "Could not verify orphan cleanup; replacement is blocked";
          clearInterval(run.timer);
          await atomic(join(runDir(run.id), "run.json"), this.public(run));
          return;
        }
        await atomic(join(runDir(run.id), "process.json"), {
          ...processState,
          state: "exited",
          reason: "Guardian lost; owned group cleaned",
        });
      }
      if (processState?.state === "exited" || run.guardianExited) {
        // Wait for the last file bytes to be consumed before assigning the final outcome.
        const size = await import("node:fs/promises").then((fs) =>
          fs
            .stat(join(runDir(run.id), "events.jsonl"))
            .then((s) => s.size)
            .catch(() => 0),
        );
        if (run.offset < size) return;
        run.terminal = true;
        if (run.stopping || processState?.interrupted)
          run.state = "interrupted";
        else if (
          !run.result ||
          (processState?.exitCode && processState.exitCode !== 0)
        )
          run.state = "failed";
        clearInterval(run.timer);
        run.guardian.stdin.destroy();
        await atomic(join(runDir(run.id), "run.json"), this.public(run));
        this.runs.delete(run.id);
      }
    } finally {
      run.ticking = false;
    }
  }
  async event(run, event) {
    if (
      event.type === "stream_event" &&
      event.event?.delta?.type === "text_delta"
    ) {
      run.progress = ((run.progress || "") + event.event.delta.text).slice(
        -8000,
      );
      run.sequence++;
    }
    if (event.type === "assistant" && !run.progress) {
      run.progress = (event.message?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .slice(-8000);
      run.sequence++;
    }
    if (
      event.type === "rate_limit_event" &&
      event.rate_limit_info?.isUsingOverage
    ) {
      run.error = "Claude reported paid overage; stopping";
      await this.cancel(run.id);
    }
    if (event.session_id && !run.claudeSession) {
      run.claudeSession = event.session_id;
      const task = await taskRead(run.threadId);
      task.claudeSession = event.session_id;
      task.sessions = { ...task.sessions, [run.cwd]: event.session_id };
      await taskWrite(task);
    }
    if (event.type === "control_request") {
      run.question = { id: event.request_id, request: event.request };
      run.state = "needs_input";
    }
    if (event.type === "result") {
      run.result = event.structured_output || {
        outcome: event.is_error ? "failed" : "needs_input",
        summary:
          event.result ||
          "Claude ended without a structured completion report.",
        evidence: [],
      };
      if (event.is_error) run.result.outcome = "failed";
      run.state = run.result.outcome;
      this.send(run, { type: "close" });
    }
    if (run.state === "starting") run.state = "running";
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
  }
  public(run) {
    const {
      id,
      threadId,
      cwd,
      host,
      selection,
      permissions,
      background,
      createdAt,
      state,
      terminal,
      question,
      result,
      claudeSession,
      error,
      progress,
      sequence,
      replySource,
      replyReason,
    } = run;
    return {
      id,
      threadId,
      cwd,
      host,
      selection,
      permissions,
      background,
      createdAt,
      state,
      terminal,
      question,
      result,
      claudeSession,
      error,
      progress,
      sequence,
      replySource,
      replyReason,
    };
  }
  async status(id) {
    const run = this.runs.get(id);
    if (run && run.state !== "cleanup_pending") return this.public(run);
    if (run) this.runs.delete(id);
    const record = await readJSON(join(runDir(id), "run.json"), null);
    if (!record) throw new Error("Unknown run");
    const p = await readJSON(join(runDir(id), "process.json"), null);
    if (
      !record.terminal &&
      p &&
      p.state !== "exited" &&
      p.guardianIdentity &&
      (await identity(p.guardianPid)) !== p.guardianIdentity
    ) {
      if (!(await stopOrphan(p)))
        return {
          ...record,
          state: "cleanup_pending",
          terminal: false,
          error: "Could not verify orphan cleanup; replacement is blocked",
        };
      await atomic(join(runDir(id), "process.json"), {
        ...p,
        state: "exited",
        reason: "Guardian lost; verified child cleanup attempted",
      });
    }
    const current = await readJSON(join(runDir(id), "process.json"), null);
    if (!record.terminal && current?.state === "exited") {
      const recovered = { ...record, state: "interrupted", terminal: true };
      await atomic(join(runDir(id), "run.json"), recovered);
      return recovered;
    }
    return record;
  }
  async wait(id, seconds = 25) {
    const run = this.runs.get(id);
    if (!run) return this.status(id);
    const until = Date.now() + Math.min(30, Math.max(0, seconds)) * 1000;
    do {
      run.lastLease = Date.now();
      if (run.terminal || run.question) return this.public(run);
      await new Promise((r) => setTimeout(r, 200));
    } while (Date.now() < until);
    return this.public(run);
  }
  async answer(args) {
    if (!["codex", "user"].includes(args.source))
      throw new Error("Invalid answer source");
    const run = this.runs.get(args.runId);
    if (!run || !run.question)
      throw new Error(
        "No live question; use start with the same task to resume a completed question turn.",
      );
    const task = await taskRead(run.threadId);
    const config = await configRead();
    if (
      args.source === "codex" &&
      task.supervisionReplies >= config.maxSupervisionReplies
    )
      throw new Error("Supervision limit reached. Escalate to the user.");
    if (run.question.id !== args.questionId)
      throw new Error("Stale question id");
    if (
      run.question.request?.tool_name !== "AskUserQuestion" &&
      args.source !== "user"
    )
      throw new Error(
        "Tool permission requests require user approval; this bridge only delegates clarification judgment.",
      );
    if (args.source === "codex" && !args.reason)
      throw new Error(
        "Record why this clarification does not require the user.",
      );
    const response = {
      behavior: args.allow === false ? "deny" : "allow",
      ...(args.allow === false
        ? { message: args.reason || "Denied" }
        : {
            updatedInput: {
              ...run.question.request.input,
              ...(args.answers ? { answers: args.answers } : {}),
            },
          }),
    };
    this.send(run, {
      type: "input",
      message: {
        type: "control_response",
        response: { subtype: "success", request_id: args.questionId, response },
      },
    });
    task.supervisionReplies =
      args.source === "user" ? 0 : task.supervisionReplies + 1;
    task.answerSequence = (task.answerSequence || 0) + 1;
    await taskWrite(task);
    await writeFile(
      join(runDir(run.id), `answer-${task.answerSequence}.json`),
      JSON.stringify({
        source: args.source,
        reason: args.reason,
        answers: args.answers,
        questionId: args.questionId,
      }),
      { mode: 0o600 },
    );
    run.question = null;
    run.state = "running";
    run.lastLease = Date.now();
    return this.public(run);
  }
  async cancel(id) {
    await writeFile(join(runDir(id), "cancel"), "stop", { mode: 0o600 });
    const run = this.runs.get(id);
    if (run) {
      run.stopping = true;
      this.send(run, { type: "stop" });
    }
    return { stopping: id };
  }
  async dispatch(method, args = {}) {
    if (method === "config") {
      if (!args.value) return configRead();
      const value = await configWrite(args.value);
      if (value.mode === "off")
        for (const run of this.runs.values())
          if (!run.terminal) await this.cancel(run.id);
      return value;
    }
    if (method === "view") return this.viewer.open(args.runId);
    if (method === "ping") return { ready: true, installationId };
    if (method === "shutdown") {
      this.draining = true;
      try {
        if ([...this.runs.values()].some((run) => !run.terminal))
          throw new Error("Active Claude runs prevent a bridge upgrade.");
        for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
          /^[0-9a-f-]{36}$/.test(id),
        )) {
          const path = join(runDir(id), "process.json");
          const owned = await readJSON(path, null);
          if (!["starting", "running"].includes(owned?.state)) continue;
          const guardian = await identity(owned.guardianPid);
          const claude = await identity(owned.claudePid);
          if (
            (guardian &&
              (!owned.guardianIdentity || guardian === owned.guardianIdentity)) ||
            (claude &&
              (!owned.claudeIdentity || claude === owned.claudeIdentity))
          )
            throw new Error("An owned Claude process prevents a bridge upgrade.");
          await atomic(path, {
            ...owned,
            state: "exited",
            reason: "Recorded process identities are no longer live",
          });
        }
        return { stopping: true };
      } catch (error) {
        this.draining = false;
        throw error;
      }
    }
    if (method === "inspect")
      return this.inspect(args.threadId, args.operation);
    if (method === "start") return this.start(args);
    if (method === "status") return this.status(args.runId);
    if (method === "wait") return this.wait(args.runId, args.seconds);
    if (method === "answer") return this.answer(args);
    if (method === "stop") return this.cancel(args.runId);
    if (method === "override") {
      const task = await taskRead(args.threadId);
      if (!["auto", "codex", "claude", "off"].includes(args.executor))
        throw new Error("Invalid override");
      task.disabled = args.executor === "off";
      task.override = args.executor === "off" ? "auto" : args.executor;
      await taskWrite(task);
      return task;
    }
    if (method === "memories") {
      const { task } = await this.inspect(args.threadId);
      task.memoryEnabled = await codexMemoryEnabled(await this.client(), task);
      return memoryContext(await configRead(), task, args.owner);
    }
    if (method === "hook") {
      const config = await configRead();
      if (config.mode === "off") return {};
      const task = await taskRead(args.threadId);
      if (["Interrupt", "SessionEnd"].includes(args.event)) {
        if (task.runId) {
          const r = await this.status(task.runId);
          if (!r.terminal && (args.event === "Interrupt" || !r.background))
            await this.cancel(task.runId);
        }
        return {};
      }
      try {
        const s = await this.inspect(args.threadId);
        return {
          additionalContext: `Claude delegation routing: ${JSON.stringify(s.route)}. Use the codex-claude skill/tools. Read current run status before starting another run. Explicit user instructions override automatic routing.`,
        };
      } catch (e) {
        return {
          additionalContext: `Claude delegation unavailable: ${e.message}. Do not infer permissions or allowance.`,
        };
      }
    }
    throw new Error("Unknown bridge operation");
  }
}
export async function serve() {
  await initStore();
  const manager = new Manager();
  let lastRequest = Date.now();
  const server = http.createServer(async (req, res) => {
    try {
      lastRequest = Date.now();
      if (req.method !== "POST" || req.url !== "/rpc") {
        res.writeHead(404);
        return res.end();
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024 * 1024) throw new Error("Request too large");
      }
      const { method, args } = JSON.parse(body);
      const result = await manager.dispatch(method, args);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
      if (method === "shutdown") setImmediate(stop);
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(join(home(), "bridge.sock"), resolve);
  });
  await chmod(join(home(), "bridge.sock"), 0o600);
  const stop = async () => {
    for (const r of manager.runs.values())
      if (!r.terminal) await manager.cancel(r.id);
    server.close();
    manager.viewer.close();
    manager.codex?.close();
    setTimeout(() => process.exit(), 11000).unref();
  };
  const idle = setInterval(() => {
    if (manager.runs.size === 0 && Date.now() - lastRequest > 300000) {
      clearInterval(idle);
      stop();
    }
  }, 30000);
  idle.unref();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { server, manager };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  serve().catch((e) => {
    process.stderr.write(e.message + "\n");
    process.exitCode = 1;
  });
