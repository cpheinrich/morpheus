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
  modelSelection,
  permissionMode,
  codexSelection,
  codexPermission,
  assertPoolAuthority,
  readGatewayQuota,
  resolveAdminCredentials,
  delegates,
  withoutReferencedSecrets,
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
import {
  checkClaude,
  handoff,
  claudeArgs,
  applyClaudeEvent,
} from "./claude.mjs";
import {
  checkCodex,
  codexHandoff,
  codexArgs,
  applyCodexEvent,
} from "./codex-exec.mjs";
import { identity, ownedProcessState, stopOrphan } from "./processes.mjs";
import { Viewer } from "./viewer.mjs";
import { memoryContext, codexMemoryEnabled } from "./memory.mjs";
import { installationId } from "./installation.mjs";
import { Pool } from "./pool.mjs";
import { HQPool } from "./pool-hq.mjs";
import {
  OPT_OUT,
  optedOut,
  dispatchHandoff,
  editTargets,
  canonical,
  within,
  renderDispatch,
  readiness,
} from "./dispatch.mjs";

export function previewSelection(config, snapshot) {
  try {
    return modelSelection(config, snapshot);
  } catch (error) {
    return { error: error.message };
  }
}
const RECENT_RUN_LIMIT = 5;
// Saved worker sessions are keyed by worktree and route: a gateway's conversation lives in
// a different account from the native login's, so neither may resume the other.
export const sessionKeyFor = (cwd, gateway) =>
  gateway ? `${cwd}#gateway:${gateway.name}` : cwd;
const routeChanged = (previous, decision) =>
  `Run ${previous.id} asked its question on ${previous.gateway ? `the ${previous.gateway} gateway (${previous.executor})` : `native ${previous.executor}`}, but routing now chooses: ${decision.reason}. Reply once that route is chosen again, or start a new handoff without replySource.`;
export class Manager {
  runs = new Map();
  taskMutations = new Map();
  codex = null;
  busy = false;
  draining = false;
  processOwnership = ownedProcessState;
  viewer = new Viewer(this);
  pool = new Pool({
    admit: (threadId, permission, conversation) =>
      this.poolAdmission(threadId, permission, conversation),
    control: (threadId, conversation) =>
      this.poolControl(threadId, conversation),
  });
  hq = new HQPool(this.pool, { draining: () => this.draining });
  // Automatic dispatch: one in-flight decision per task turn, and launches queued behind each
  // other rather than refused by the single-start guard.
  dispatching = new Map();
  dispatchChain = Promise.resolve();
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
  async taskTransaction(id, transaction) {
    const previous = this.taskMutations.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const task = await taskRead(id);
      if (await transaction(task)) await taskWrite(task);
      return task;
    });
    this.taskMutations.set(id, current);
    try {
      return await current;
    } finally {
      if (this.taskMutations.get(id) === current) this.taskMutations.delete(id);
    }
  }
  async mutateTask(id, mutation) {
    return this.taskTransaction(id, async (task) => {
      await mutation(task);
      return true;
    });
  }
  async taskRuns(task, includeMissing = false) {
    const ids = new Set([...(task.runIds ?? []), task.runId].filter(Boolean));
    for (const run of this.runs.values())
      if (run.threadId === task.id) ids.add(run.id);
    const records = await Promise.all(
      [...ids].map(async (id) => [id, await this.status(id).catch(() => null)]),
    );
    const runs = records
      .map(([, run]) => run)
      .filter(Boolean)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const view = {
      active: runs.filter((run) => !run.terminal),
      recent: runs.filter((run) => run.terminal).slice(0, RECENT_RUN_LIMIT),
    };
    if (includeMissing)
      view.missing = records
        .filter(([, run]) => !run)
        .map(([id]) => id)
        .slice(-RECENT_RUN_LIMIT);
    return view;
  }
  async codexRunId(args) {
    if (args.runId) return args.runId;
    const task = await taskRead(claudeTaskId(args.sessionId));
    const runs = await this.taskRuns(task);
    if (runs.active.length > 1)
      throw new Error(
        `runId is required because this session has multiple active runs: ${runs.active.map((run) => run.id).join(", ")}`,
      );
    const run = runs.active[0] ?? runs.recent[0];
    if (!run) throw new Error("This session has no delegated runs.");
    return run.id;
  }
  async inspect(id, operation) {
    const config = await configRead();
    const snapshot = await this.snapshot(id);
    const identity = await projectIdentity(snapshot.cwd);
    const task = await this.mutateTask(id, (current) => {
      Object.assign(current, identity);
    });
    const gateways = await readGatewayQuota(
      config.gateways,
      await resolveAdminCredentials(config),
    );
    return {
      task,
      snapshot,
      gateways,
      route: route(config, task, gateways, operation),
      // What a start without overrides would run, including fallback provenance, so the
      // coordinator can report it before launching; a refusal is reported, not thrown.
      selection: previewSelection(config, snapshot),
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
      if (!delegates(decision, "codex")) throw new Error(decision.reason);
      // A Codex task delegates to Claude (native or gateway) or to Codex behind a gateway.
      const worker = decision.executor;
      // Worktree correction is explicit because Morpheus can move work after the turn starts.
      const identity = await projectIdentity(args.cwd || snapshot.cwd);
      if (identity.project !== task.project)
        throw new Error(
          "Delegation directory must belong to the Codex task repository.",
        );
      task.cwd = identity.cwd;
      // Saved worker sessions are kept per route, so a gateway conversation never resumes a
      // native one (or another gateway's) in the same worktree.
      const sessionKey = sessionKeyFor(task.cwd, decision.gateway);
      task.claudeSession =
        worker === "claude" ? task.sessions?.[sessionKey] || null : null;
      const codexSession =
        worker === "codex" ? task.codexSessions?.[sessionKey] || null : null;
      const previous = task.runId ? await this.status(task.runId) : null;
      if (previous && !previous.terminal)
        throw new Error(
          "This task already has an active run. Resume monitoring it instead.",
        );
      const continuation =
        previous?.state === "needs_input" || !!previous?.question;
      // A reply resumes the conversation that asked, so it must take the same route.
      if (
        continuation &&
        (previous.executor !== worker || (previous.sessionKey ?? previous.cwd) !== sessionKey)
      )
        throw new Error(routeChanged(previous, decision));
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
      const owner = active.find((run) => run.cwd === task.cwd);
      if (owner)
        throw new Error(
          `Run ${owner.id} already owns this working directory. Wait for or stop that run before starting another writer here.`,
        );
      if (active.length >= config.maxConcurrent)
        throw new Error("Delegation concurrency limit reached.");
      await this.recoverOrphans(task);
      const permissions = permissionMode(snapshot);
      // A Codex worker runs the coordinator's own model and effort; the sandbox follows the
      // same approval mapping, never wider (full access only for a never-approve task).
      const selection =
        worker === "claude"
          ? modelSelection(config, snapshot, { model: args.model, effort: args.effort })
          : {
              model: args.model ?? snapshot.model,
              effort: args.effort ?? snapshot.reasoningEffort ?? null,
            };
      const codexSandbox = worker === "codex" ? codexPermission(permissions) : null;
      const env = withoutReferencedSecrets(
        (worker === "claude"
          ? await checkClaude(task.cwd, undefined, decision.gateway ?? null)
          : await checkCodex(task.cwd, undefined, decision.gateway ?? null)
        ).env,
        config,
      );
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
      // Shared memory is the other agent's store, so a same-provider worker gets none.
      const memories =
        worker === "claude" ? await memoryContext(config, task, "codex") : [];
      const prompt =
        worker === "claude"
          ? await handoff(args.prompt, memories, "Codex")
          : await codexHandoff(args.prompt, memories, "Codex");
      const record = {
        id,
        executor: worker,
        threadId: task.id,
        cwd: task.cwd,
        sessionKey,
        gateway: decision.gateway?.name ?? null,
        host: hostname(),
        selection,
        permissions: codexSandbox?.name ?? permissions,
        background: args.background === true,
        createdAt: Date.now(),
        state: "starting",
        terminal: false,
        question: null,
        result: null,
        claudeSession: task.claudeSession,
        codexSession,
        replySource: args.replySource,
        replyReason: args.replyReason,
        dispatch: args.dispatch ?? null,
      };
      await this.launch(
        record,
        {
          runId: id,
          argv:
            worker === "claude"
              ? claudeArgs(task.claudeSession, selection, permissions)
              : codexArgs(codexSession, selection, codexSandbox, decision.gateway ?? null),
          cwd: task.cwd,
          prompt,
          ...(worker === "codex" ? { input: "text" } : {}),
          background: record.background,
          graceSeconds: config.disconnectGraceSeconds,
          maxRunSeconds: config.maxRunSeconds,
        },
        env,
        config,
      );
      await this.mutateTask(task.id, (current) => {
        current.runId = id;
        current.supervisionReplies = replies;
      });
      return this.begin(id);
    } finally {
      this.busy = false;
    }
  }
  // Pool admission keeps the bridge's local invariants: no launch while draining or
  // disabled (globally, for the task, or for its project), verified live settings of
  // the calling task, and no permission wider than that task's own sandbox.
  async poolAdmission(threadId, permission, conversation = null) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    await this.poolControl(threadId, conversation);
    const config = await configRead();
    const snapshot = await this.snapshot(threadId);
    const identity = await projectIdentity(snapshot.cwd);
    const task = await this.mutateTask(threadId, (current) => {
      Object.assign(current, identity);
    });
    if (task.disabled || config.projects[task.project] === "off")
      throw new Error("Delegation disabled for this task or project");
    assertPoolAuthority(snapshot, permission);
    return { project: task.project };
  }
  // Answers act on an admitted turn; they need no live snapshot, but off still wins.
  async poolControl(threadId, conversation = null) {
    const config = await configRead();
    if (config.mode === "off") throw new Error("Delegation disabled");
    const caller = await taskRead(threadId);
    if (caller.disabled || (caller.project && config.projects[caller.project] === "off"))
      throw new Error("Delegation disabled for this task or project");
    if (conversation) {
      const owner = await taskRead(conversation.threadId);
      if (owner.disabled || (conversation.project && config.projects[conversation.project] === "off"))
        throw new Error("Delegation is disabled for this conversation's task or project");
    }
  }
  async recoverOrphans(task) {
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
  }
  // Shared by both directions: one guardian owns one worker process group.
  async launch(record, job, env, config) {
    await atomic(join(runDir(record.id), "run.json"), record);
    await atomic(join(runDir(record.id), "job.json"), job);
    const guardian = spawn(
      "python3",
      [
        fileURLToPath(new URL("./guardian.py", import.meta.url)),
        join(runDir(record.id), "job.json"),
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
    this.runs.set(record.id, run);
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
    return run;
  }
  begin(id) {
    const run = this.runs.get(id);
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
    if (run.executor === "codex") return this.codexEvent(run, event);
    const effects = applyClaudeEvent(run, event);
    if (effects.overage) await this.cancel(run.id);
    if (effects.session) {
      await this.mutateTask(run.threadId, (task) => {
        task.claudeSession = effects.session;
        task.sessions = {
          ...task.sessions,
          [run.sessionKey ?? run.cwd]: effects.session,
        };
      });
    }
    if (effects.ended) this.send(run, { type: "close" });
    if (run.state === "starting") run.state = "running";
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
  }
  async codexEvent(run, event) {
    const ended = applyCodexEvent(run, event);
    if (run.newSession && !run.codexSession) {
      run.codexSession = run.newSession;
      await this.mutateTask(run.threadId, (task) => {
        task.codexSessions = {
          ...task.codexSessions,
          [run.sessionKey ?? run.cwd]: run.newSession,
        };
      });
    }
    if (ended) this.send(run, { type: "close" });
    if (run.state === "starting") run.state = "running";
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
  }
  public(run) {
    const {
      id,
      executor,
      codexSession,
      threadId,
      cwd,
      sessionKey,
      gateway,
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
      dispatch,
    } = run;
    return {
      id,
      executor,
      codexSession,
      threadId,
      cwd,
      sessionKey,
      gateway: gateway ?? null,
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
      dispatch: dispatch ?? null,
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
    // The coordinator answers as itself (codex or claude) or attests a user's answer.
    if (!["codex", "claude", "user"].includes(args.source))
      throw new Error("Invalid answer source");
    const run = this.runs.get(args.runId);
    if (!run || !run.question)
      throw new Error(
        "No live question; use start with the same task to resume a completed question turn.",
      );
    const task = await taskRead(run.threadId);
    const config = await configRead();
    const autonomous = args.source !== "user";
    if (autonomous && task.supervisionReplies >= config.maxSupervisionReplies)
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
    if (autonomous && !args.reason)
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
    const updated = await this.mutateTask(run.threadId, (current) => {
      current.supervisionReplies =
        args.source === "user" ? 0 : current.supervisionReplies + 1;
      current.answerSequence = (current.answerSequence || 0) + 1;
    });
    await writeFile(
      join(runDir(run.id), `answer-${updated.answerSequence}.json`),
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
  // Claude-coordinated sessions: Claude is primary and Codex is the delegate.
  async claudeInspect(sessionId, operation) {
    const config = await configRead();
    const taskId = claudeTaskId(sessionId);
    const gateways = await readGatewayQuota(
      config.gateways,
      await resolveAdminCredentials(config),
    );
    let runs;
    const task = await this.taskTransaction(taskId, async (current) => {
      let changed = false;
      if (current.session?.cwd) {
        const identity = await projectIdentity(current.session.cwd);
        if (current.cwd !== identity.cwd || current.project !== identity.project) {
          Object.assign(current, identity);
          changed = true;
        }
      }
      runs = await this.taskRuns(current, true);
      const known = [...runs.active, ...runs.recent].map((run) => run.id);
      const retained = [...new Set([...known, ...runs.missing])];
      if (
        retained.length !== (current.runIds ?? []).length ||
        retained.some((id, index) => id !== current.runIds[index])
      ) {
        current.runIds = retained;
        changed = true;
      }
      const runId = known.includes(current.runId) ? current.runId : known[0] ?? null;
      if (current.runId !== runId) {
        current.runId = runId;
        changed = true;
      }
      return changed;
    });
    delete runs.missing;
    return {
      task,
      session: task.session ?? null,
      runs,
      gateways,
      route: route(config, task, gateways, operation, "claude"),
    };
  }
  async codexStart(args) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    if (this.busy)
      throw new Error("Another delegation is starting; retry shortly.");
    this.busy = true;
    try {
      const config = await configRead();
      const { task, runs, route: decision } = await this.claudeInspect(
        args.sessionId,
        args.operation,
      );
      if (!delegates(decision, "claude")) throw new Error(decision.reason);
      // A Claude session delegates to Codex (native or gateway) or to Claude behind a gateway.
      const worker = decision.executor;
      const session = task.session;
      if (!session?.cwd || !session.permissionMode)
        throw new Error(
          "No verified Claude session settings yet. The plugin's hooks record them; trust the hooks and send a message first.",
        );
      const replying = args.replySource != null || args.replyReason != null;
      let previous = null;
      if (args.runId) {
        previous = await this.status(args.runId);
        if (previous.threadId !== task.id)
          throw new Error("The requested run belongs to another Claude session.");
        if (args.cwd && (await projectIdentity(args.cwd)).cwd !== previous.cwd)
          throw new Error("The requested run belongs to a different working directory.");
      }
      if (replying) {
        const awaiting = [...runs.active, ...runs.recent].filter(
          (run) => run.state === "needs_input",
        );
        if (previous && previous.state !== "needs_input")
          throw new Error(`Run ${previous.id} is not awaiting input.`);
        if (!previous && awaiting.length === 0)
          throw new Error("no run is awaiting input.");
        if (!previous && awaiting.length > 1)
          throw new Error(
            `runId is required because multiple runs are awaiting input: ${awaiting.map((run) => run.id).join(", ")}`,
          );
        previous ??= awaiting[0];
      }
      const identity = await projectIdentity(
        args.cwd || previous?.cwd || session.cwd,
      );
      if (identity.project !== task.project)
        throw new Error(
          "Delegation directory must belong to the Claude session repository.",
        );
      task.cwd = identity.cwd;
      const sessionKey = sessionKeyFor(task.cwd, decision.gateway);
      const sameRoute = (run) =>
        run.executor === worker && (run.sessionKey ?? run.cwd) === sessionKey;
      if (previous && previous.state === "needs_input" && !sameRoute(previous))
        throw new Error(routeChanged(previous, decision));
      previous ??= [...runs.active, ...runs.recent].find(sameRoute);
      const codexSession =
        worker === "codex"
          ? (previous?.codexSession ?? task.codexSessions?.[sessionKey] ?? null)
          : null;
      const claudeSession =
        worker === "claude"
          ? (previous?.claudeSession ?? task.sessions?.[sessionKey] ?? null)
          : null;
      // Codex exec cannot ask mid-run, so its every question arrives as needs_input; a
      // Claude worker can also ask live, answered through codex.answer.
      const continuation = previous?.state === "needs_input";
      if (
        continuation &&
        (!["claude", "user"].includes(args.replySource) || !args.replyReason)
      )
        throw new Error(
          "Resuming a question requires replySource and replyReason.",
        );
      const priorReplies =
        task.supervisionRepliesByCwd?.[task.cwd] ??
        task.supervisionReplies ??
        0;
      const replies =
        continuation && args.replySource === "claude"
          ? priorReplies + 1
          : 0;
      if (replies > config.maxSupervisionReplies)
        throw new Error("Supervision limit reached. Escalate to the user.");
      const active = [...this.runs.values()].filter((r) => !r.terminal);
      const owner = active.find((run) => run.cwd === task.cwd);
      if (owner)
        throw new Error(
          `Run ${owner.id} already owns this working directory. Wait for or stop that run before starting another writer here.`,
        );
      if (active.length >= config.maxConcurrent)
        throw new Error("Delegation concurrency limit reached.");
      await this.recoverOrphans(task);
      const outside = !`${identity.project}/`.startsWith(`${identity.cwd}/`);
      // A Claude worker inherits the session's own model, effort and permission mode, so
      // it can never be wider than the coordinator.
      const selection =
        worker === "codex"
          ? codexSelection(config, session, { model: args.model, effort: args.effort })
          : {
              model: args.model ?? session.model ?? config.modelFallback ?? "opus",
              effort:
                config.effortMap[args.effort ?? session.effort] ??
                session.effort ??
                "high",
            };
      const permission =
        worker === "codex"
          ? codexPermission(session.permissionMode, outside ? [identity.project] : [])
          : { name: session.permissionMode };
      const env = withoutReferencedSecrets(
        (worker === "codex"
          ? await checkCodex(task.cwd, undefined, decision.gateway ?? null)
          : await checkClaude(task.cwd, undefined, decision.gateway ?? null)
        ).env,
        config,
      );
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
      await mkdir(runDir(id), { mode: 0o700 });
      // Claude's own memory switches are checked inside memoryContext.
      task.memoryEnabled = config.memorySharing;
      // Shared memory is the other agent's store, so a same-provider worker gets none.
      const memories =
        worker === "codex" ? await memoryContext(config, task, "claude") : [];
      const prompt =
        worker === "codex"
          ? await codexHandoff(args.prompt, memories, "Claude Code")
          : await handoff(args.prompt, memories, "Claude Code");
      const record = {
        id,
        executor: worker,
        threadId: task.id,
        sessionId: args.sessionId,
        cwd: task.cwd,
        sessionKey,
        gateway: decision.gateway?.name ?? null,
        host: hostname(),
        selection,
        permissions: permission.name,
        background: args.background === true,
        createdAt: Date.now(),
        state: "starting",
        terminal: false,
        question: null,
        result: null,
        codexSession,
        claudeSession,
        replySource: args.replySource,
        replyReason: args.replyReason,
        dispatch: args.dispatch ?? null,
      };
      await this.launch(
        record,
        {
          runId: id,
          argv:
            worker === "codex"
              ? codexArgs(codexSession, selection, permission, decision.gateway ?? null)
              : claudeArgs(claudeSession, selection, permission.name),
          cwd: task.cwd,
          prompt,
          ...(worker === "codex" ? { input: "text" } : {}),
          background: record.background,
          graceSeconds: config.disconnectGraceSeconds,
          maxRunSeconds: config.maxRunSeconds,
        },
        env,
        config,
      );
      await this.mutateTask(task.id, (current) => {
        current.runId = id;
        current.runIds = [...new Set([...(current.runIds ?? []), id])];
        current.memoryEnabled = config.memorySharing;
        current.supervisionReplies = replies;
        current.supervisionRepliesByCwd = {
          ...current.supervisionRepliesByCwd,
          [task.cwd]: replies,
        };
      });
      return this.begin(id);
    } finally {
      this.busy = false;
    }
  }
  // A UserPromptSubmit in automatic mode launches the routed worker through the same start
  // path the tools use, so routing, quota, ownership, concurrency and permissions are
  // unchanged. The coordinator stays the manager; it is told what happened and what to do.
  async autoDispatch(primary, s, args) {
    const key = args.turnKey;
    const memo = key && `${s.task.id}\n${key}`;
    if (memo && this.dispatching.has(memo)) return this.dispatching.get(memo);
    const pending = (async () => {
      // A turn already handled answers the same way, including a retried hook.
      const recorded = key && (await taskRead(s.task.id)).dispatches?.[key];
      if (recorded) return recorded.outcome ?? this.reconcileDispatch(s.task, key);
      // A live run or an unanswered question is the manager's before anything else, whatever
      // the route says now: a changed or unreadable quota never moves an in-flight writer.
      const held = await this.heldRuns(s.task);
      if (held) return held;
      if (optedOut(args.prompt))
        return { kind: "local", reason: `the prompt starts with "${OPT_OUT}"` };
      if (!key)
        return {
          kind: "unknown",
          reason: "this turn has no readable identity, so it could not be dispatched without risking a duplicate worker",
        };
      // Reserved durably before launch, so a restart after launching can only find the run
      // again or report that it cannot tell; it never launches a second worker for the turn.
      let earlier;
      await this.taskTransaction(s.task.id, async (task) => {
        earlier = task.dispatches?.[key];
        if (earlier) return false;
        const entries = Object.entries(task.dispatches ?? {});
        entries.push([key, { at: Date.now() }]);
        task.dispatches = Object.fromEntries(entries.slice(-20));
        return true;
      });
      if (earlier) return earlier.outcome ?? this.reconcileDispatch(s.task, key);
      const outcome = await this.dispatchTurn(primary, s, args);
      await this.recordDispatch(s.task.id, key, outcome);
      return outcome;
    })();
    if (!memo) return pending;
    const shared = pending.finally(() => this.dispatching.delete(memo));
    this.dispatching.set(memo, shared);
    return shared;
  }
  async recordDispatch(taskId, key, outcome) {
    await this.mutateTask(taskId, (task) => {
      task.dispatches = { ...task.dispatches, [key]: { ...task.dispatches?.[key], outcome } };
    });
  }
  // A reservation without an outcome: the service stopped, or lost the result, between
  // reserving the turn and recording what happened. Every run record names its turn.
  async reconcileDispatch(task, key) {
    for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
      /^[0-9a-f-]{36}$/.test(id),
    )) {
      const record = await readJSON(join(runDir(id), "run.json"), null);
      if (record?.threadId !== task.id || record.dispatch !== key) continue;
      const outcome = { kind: "dispatched", run: briefRun(await this.status(id)) };
      await this.mutateTask(task.id, (current) => {
        current.runIds = [...new Set([...(current.runIds ?? []), id])];
      });
      await this.recordDispatch(task.id, key, outcome);
      return outcome;
    }
    return {
      kind: "unknown",
      reason: "an earlier attempt to dispatch this turn stopped before recording its result, and no worker for it was found",
    };
  }
  async heldRuns(task) {
    const runs = await this.taskRuns(task);
    // A live run is the manager's to supervise; a new prompt is never steered into it.
    if (runs.active.length) return { kind: "active", runs: runs.active.map(briefRun) };
    // A finished question is answered by the manager, never by the next prompt.
    const all = [...runs.active, ...runs.recent];
    const waiting = runs.recent.filter(
      (run) =>
        run.state === "needs_input" &&
        !all.some((other) => other.cwd === run.cwd && other.createdAt > run.createdAt),
    );
    return waiting.length ? { kind: "waiting", runs: waiting.map(briefRun) } : null;
  }
  async dispatchTurn(primary, s, args) {
    const { task, route: decision } = s;
    if (!delegates(decision, primary)) return { kind: "local", reason: decision.reason };
    try {
      const cwd = (await projectIdentity(args.cwd || task.cwd)).cwd;
      const previous = (await this.taskRuns(task)).recent.find(
        (run) => run.cwd === cwd && typeof run.result?.summary === "string",
      );
      const prompt = dispatchHandoff(args.prompt, previous);
      const dispatch = args.turnKey;
      const launch = this.dispatchChain.then(() =>
        primary === "claude"
          ? this.codexStart({ sessionId: args.sessionId, prompt, cwd, dispatch })
          : this.start({ threadId: task.id, prompt, cwd, dispatch }),
      );
      this.dispatchChain = launch.catch(() => {});
      return { kind: "dispatched", run: briefRun(await launch) };
    } catch (e) {
      return { kind: "failed", reason: e.message };
    }
  }
  // Hook output: advice alone unless Factory is active for this task (`active` names its
  // mode). SessionStart then adds readiness; in automatic mode UserPromptSubmit dispatches.
  // The first prompt of an active session also asks for a one-line notice in the reply.
  async automaticHook(primary, args, advice, active) {
    if (!active || !["SessionStart", "UserPromptSubmit"].includes(args.event)) return advice;
    if (args.event === "SessionStart")
      return {
        ...advice,
        systemMessage: readiness(active.mode, active.inspected?.route, primary, active.failure),
      };
    const id = primary === "claude" ? claudeTaskId(args.sessionId) : args.threadId;
    let outcome;
    if (active.mode === "manual") outcome = { kind: "manual" };
    else if (active.failure)
      outcome = (await this.heldRuns(await taskRead(id))) ?? {
        kind: "failed",
        reason: active.failure,
      };
    else outcome = await this.autoDispatch(primary, active.inspected, args);
    // A retried hook of the first turn repeats the notice; no later turn does.
    const turn = args.turnKey ?? `unidentified:${randomUUID()}`;
    let first = false;
    await this.taskTransaction(id, async (task) => {
      if (task.noticeTurn) {
        first = task.noticeTurn === turn;
        return false;
      }
      task.noticeTurn = turn;
      first = true;
      return true;
    });
    // Manual mode says so once; after that its turns carry the advice alone.
    if (outcome.kind === "manual" && !first) return advice;
    const rendered = renderDispatch(outcome, {
      tools: primary === "claude" ? "codex" : "claude",
      first,
    });
    return {
      systemMessage: rendered.systemMessage,
      additionalContext: `${advice.additionalContext}\n\n${rendered.additionalContext}`,
    };
  }
  // Refuses the coordinator's native edits inside a checkout its own worker is writing. It
  // prevents an accidental race; shell commands and unknown tools are not inspected.
  async guard(taskId, args) {
    const targets = editTargets(args.tool, args.toolInput, args.cwd);
    if (!targets) return {};
    const { active } = await this.taskRuns(await taskRead(taskId));
    for (const run of active) {
      for (const target of targets)
        if (within(await canonical(target), run.cwd))
          return {
            deny: `Factory run ${run.id} (${run.executor}) is writing in ${run.cwd}. Wait for it, or stop it and wait until it is terminal, before editing files there.`,
          };
    }
    return {};
  }
  // Factory's mode for this task, or null when it is off.
  active(config, task, detail) {
    if (config.mode === "off") return null;
    const mode = config.projects[task.project] ?? config.mode;
    return mode === "off" ? null : { mode, ...detail };
  }
  async codexHook(args) {
    const config = await configRead();
    if (config.mode === "off") return {};
    const taskId = claudeTaskId(args.sessionId);
    if (args.event === "PreToolUse") return this.guard(taskId, args);
    const task = await taskRead(taskId);
    if (args.event === "SessionEnd") {
      for (const run of (await this.taskRuns(task)).active)
        if (!run.background) await this.cancel(run.id);
      return {};
    }
    // Hook input is Claude's own report of the session, so it is the settings source.
    await this.mutateTask(taskId, (current) => {
      const previous = current.session ?? {};
      current.session = {
        cwd: args.cwd ?? previous.cwd,
        permissionMode: args.permissionMode ?? previous.permissionMode,
        model: args.model ?? previous.model,
        effort: args.effort ?? previous.effort,
        updatedAt: Date.now(),
      };
    });
    let s;
    try {
      s = await this.claudeInspect(args.sessionId);
    } catch (e) {
      return this.automaticHook(
        "claude",
        args,
        { additionalContext: `Codex delegation unavailable: ${e.message}. Do not infer permissions or allowance.` },
        this.active(config, await taskRead(taskId), { failure: e.message }),
      );
    }
    return this.automaticHook(
      "claude",
      args,
      { additionalContext: `Factory delegation routing (sessionId ${args.sessionId}): ${JSON.stringify(s.route)}. A gateway route runs a worker through that gateway credential, Claude included; only this session's own native login is never a delegate. Use the factory delegate-to-codex skill and codex_* tools. Inspect active runs before starting another run. Explicit user instructions override automatic routing.` },
      this.active(config, s.task, { inspected: s }),
    );
  }
  async dispatch(method, args = {}) {
    if (method === "config") {
      if (!args.value) return configRead();
      const value = await configWrite(args.value);
      if (value.mode === "off") {
        for (const run of this.runs.values())
          if (!run.terminal) await this.cancel(run.id);
        await this.pool.stopAll().catch(() => {});
      }
      return value;
    }
    if (method === "codex.view")
      return this.viewer.open(await this.codexRunId(args));
    if (method === "codex.status")
      return this.status(await this.codexRunId(args));
    if (method === "codex.wait")
      return this.wait(await this.codexRunId(args), args.seconds);
    if (method === "codex.stop")
      return this.cancel(await this.codexRunId(args));
    if (method === "view") return this.viewer.open(args.runId);
    if (method === "ping") return { ready: true, installationId };
    if (method === "shutdown") {
      this.draining = true;
      try {
        if (this.busy)
          throw new Error("A Claude delegation is starting; retry the upgrade.");
        if ([...this.runs.values()].some((run) => !run.terminal))
          throw new Error("Active Claude runs prevent a bridge upgrade.");
        for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
          /^[0-9a-f-]{36}$/.test(id),
        )) {
          const path = join(runDir(id), "process.json");
          const owned = await readJSON(path, null);
          if (!["starting", "running"].includes(owned?.state)) continue;
          const ownership = await this.processOwnership(owned);
          if (ownership === "live")
            throw new Error("An owned Claude process prevents a bridge upgrade.");
          if (ownership === "unknown")
            throw new Error(
              "Claude process ownership could not be verified; bridge upgrade refused.",
            );
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
    // Remote pool turns are owned by Paperclip's runner, not this service.
    if (method.startsWith("hq.")) return this.hq.dispatch(method.slice(3), args);
    if (method.startsWith("pool.")) return this.pool.dispatch(method.slice(5), args);
    if (method === "inspect")
      return this.inspect(args.threadId, args.operation);
    if (method === "start") return this.start(args);
    if (method === "status") return this.status(args.runId);
    if (method === "wait") return this.wait(args.runId, args.seconds);
    if (method === "answer") return this.answer(args);
    if (method === "stop") return this.cancel(args.runId);
    if (method === "override") {
      if (!["auto", "codex", "claude", "off"].includes(args.executor))
        throw new Error("Invalid override");
      return this.mutateTask(args.threadId, (task) => {
        task.disabled = args.executor === "off";
        task.override = args.executor === "off" ? "auto" : args.executor;
      });
    }
    if (method === "codex.inspect")
      return this.claudeInspect(args.sessionId, args.operation);
    if (method === "codex.start") return this.codexStart(args);
    // A gateway Claude worker can ask live; its Claude coordinator answers here.
    if (method === "codex.answer") {
      const runId = await this.codexRunId(args);
      const run = await this.status(runId);
      if (run.threadId !== claudeTaskId(args.sessionId))
        throw new Error("The requested run belongs to another Claude session.");
      return this.answer({ ...args, runId });
    }
    if (method === "codex.hook") return this.codexHook(args);
    if (method === "codex.override") {
      if (!["auto", "codex", "claude", "off"].includes(args.executor))
        throw new Error("Invalid override");
      return this.mutateTask(claudeTaskId(args.sessionId), (task) => {
        task.disabled = args.executor === "off";
        task.override = args.executor === "off" ? "auto" : args.executor;
      });
    }
    if (method === "codex.memories") {
      const { task } = await this.claudeInspect(args.sessionId);
      task.memoryEnabled = (await configRead()).memorySharing;
      return memoryContext(await configRead(), task, args.owner);
    }
    if (method === "memories") {
      const { task } = await this.inspect(args.threadId);
      task.memoryEnabled = await codexMemoryEnabled(await this.client(), task);
      return memoryContext(await configRead(), task, args.owner);
    }
    if (method === "hook") {
      const config = await configRead();
      if (config.mode === "off") return {};
      if (args.event === "PreToolUse") return this.guard(args.threadId, args);
      const task = await taskRead(args.threadId);
      if (["Interrupt", "SessionEnd"].includes(args.event)) {
        if (task.runId) {
          const r = await this.status(task.runId);
          if (!r.terminal && (args.event === "Interrupt" || !r.background))
            await this.cancel(task.runId);
        }
        return {};
      }
      let s;
      try {
        s = await this.inspect(args.threadId);
      } catch (e) {
        return this.automaticHook(
          "codex",
          args,
          { additionalContext: `Claude delegation unavailable: ${e.message}. Do not infer permissions or allowance.` },
          this.active(config, task, { failure: e.message }),
        );
      }
      return this.automaticHook(
        "codex",
        args,
        { additionalContext: `Claude delegation routing: ${JSON.stringify(s.route)}. Use the factory skill/tools. Read current run status before starting another run. Explicit user instructions override automatic routing.` },
        this.active(config, s.task, { inspected: s }),
      );
    }
    throw new Error("Unknown bridge operation");
  }
}
const briefRun = (run) => ({
  id: run.id,
  executor: run.executor,
  gateway: run.gateway ?? null,
  cwd: run.cwd,
  state: run.state,
  question: run.result?.question || run.result?.summary || null,
});
export function claudeTaskId(sessionId) {
  if (!/^[a-zA-Z0-9-]{1,90}$/.test(sessionId ?? ""))
    throw new Error("Invalid Claude session id");
  return `claude_${sessionId}`;
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
