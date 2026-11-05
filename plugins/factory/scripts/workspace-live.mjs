#!/usr/bin/env node
// Live multi-repository workspace smoke for a real root session and a real provider. It runs
// the source bridge in-process against an isolated FACTORY_HOME, so it never touches the
// installed service or another session's workers. Every value it prints comes from the real
// run records, task records and Git; nothing is synthesized.
//
//   FACTORY_HOME=$(mktemp -d) node scripts/workspace-live.mjs \
//     --root-kind codex --root-id <real root id> [--second-root-id <another real root id>] \
//     [--config <private config.json with gateways/keyRefs only>]
//
// Steps: (1) one delegation writes two disposable repositories, (2) a follow-up resumes the same
// native session, (3) a third repository is added to that session, (4) a second root gets its own
// worktrees of the same repositories, and (5) the second root's attempt to register the first
// root's gamma checkout is refused. Originals are checked for untouched state throughout.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { values } = parseArgs({
  options: {
    "root-kind": { type: "string", default: "codex" },
    "root-id": { type: "string" },
    "second-root-id": { type: "string" },
    config: { type: "string" },
  },
});
if (!process.env.FACTORY_HOME || !values["root-id"])
  throw new Error("Set an isolated FACTORY_HOME and pass --root-id (see the header).");
const { initStore, configWrite, configRead, taskRead } = await import("../src/store.mjs");
const { Manager } = await import("../src/service.mjs");
const { defaults } = await import("../src/config.mjs");
await initStore();
const saved = values.config ? JSON.parse(await readFile(values.config, "utf8")) : {};
await configWrite({ ...defaults(), ...saved, mode: "manual" });

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const scratch = await realpath(await mkdtemp(join(tmpdir(), "factory-live-")));
const repos = {};
for (const name of ["alpha", "beta", "gamma"]) {
  const dir = join(scratch, name);
  await mkdir(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "smoke@example.com");
  git(dir, "config", "user.name", "Smoke");
  await writeFile(join(dir, "README.md"), `${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "commit", "-qm", "fixture");
  repos[name] = dir;
}
await writeFile(join(repos.alpha, "README.md"), "uncommitted original edit\n");

const manager = new Manager();
const kind = values["root-kind"];
const brief = (label) =>
  `Live Factory workspace smoke. In EVERY task-owned checkout listed in the Factory workspace section above, append one line "${label}" to NOTES.md (create it if missing). Do not commit, do not touch any other path, and report the absolute NOTES.md paths you wrote as evidence.`;
async function delegate(rootId, args) {
  const started = await manager.dispatch("factory.delegate", { rootKind: kind, rootId, ...args });
  let run = started;
  for (let i = 0; i < 720 && !run.terminal && !run.question; i++)
    run = await manager.dispatch("factory.wait", { rootKind: kind, rootId, runId: started.id, seconds: 25 });
  return run;
}
const summary = (run) => ({
  id: run.id,
  executor: run.executor,
  gateway: run.gateway,
  state: run.state,
  nativeSession: run.claudeSession ?? run.codexSession ?? null,
  cwd: run.cwd,
  dirs: run.dirs,
  result: run.result,
});
const evidence = { scratch, steps: [] };
const record = async (step, rootId, args) => {
  try {
    const run = await delegate(rootId, args);
    evidence.steps.push({ step, run: summary(run) });
    return run;
  } catch (error) {
    evidence.steps.push({ step, refused: error.message });
    return null;
  }
};
const root = values["root-id"];
await record("1 two repositories", root, { cwd: repos.alpha, repos: [repos.beta], prompt: brief("live-1") });
await record("2 resume", root, { prompt: brief("live-2") });
await record("3 add gamma", root, { repos: [repos.gamma], prompt: brief("live-3") });
evidence.firstTask = (await manager.factoryInspect({ rootKind: kind, rootId: root })).workspace;
const second = values["second-root-id"];
if (second) {
  await record("4 second root, same repositories", second, { cwd: repos.alpha, repos: [repos.beta], prompt: brief("other-root") });
  evidence.secondTask = (await manager.factoryInspect({ rootKind: kind, rootId: second })).workspace;
  // gamma is unmapped for the second root, so only cross-task ownership can refuse it.
  const gammaCommon = Object.keys(evidence.firstTask.repositories).find((key) => key.startsWith(repos.gamma));
  await record("5 second root claims first root's checkout", second, {
    repos: [evidence.firstTask.repositories[gammaCommon].path],
    prompt: brief("must-not-run"),
  });
}
evidence.originals = Object.fromEntries(
  Object.entries(repos).map(([name, dir]) => [name, git(dir, "status", "--porcelain")]),
);
evidence.notes = {};
for (const task of [evidence.firstTask, evidence.secondTask].filter(Boolean))
  for (const entry of Object.values(task.repositories ?? {}))
    evidence.notes[entry.path] = await readFile(join(entry.path, "NOTES.md"), "utf8").catch(() => null);
evidence.config = { mode: (await configRead()).mode, factoryHome: process.env.FACTORY_HOME };
const firstRecord = await taskRead(kind === "codex" ? root : `claude_${root}`);
evidence.taskSessions = { claude: firstRecord.sessions ?? null, codex: firstRecord.codexSessions ?? null };
process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
manager.viewer.close();
manager.codex?.close();
process.exit(0);
