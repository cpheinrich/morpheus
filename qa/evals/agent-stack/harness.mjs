#!/usr/bin/env node
// Historical decision evaluation for the agent stack: freeze, render, score, report.
//
// Cases are sanitized reconstructions of real project records. Oracles live in a
// separate directory and never reach a worker: render reads only the case, the frozen
// prompt, the shared rubric and the retrieved lessons. Execution happens through
// Paperclip, dispatched by an operator; this script never calls a model or provider.
//
//   node harness.mjs freeze --model M --effort E   write manifest.json once, before any execution
//   node harness.mjs verify                        refuse if any frozen input changed
//   node harness.mjs render CASE baseline|candidate [ATTEMPT]
//   node harness.mjs score CASE OUTPUT.json
//   node harness.mjs report RESULTS_DIR            every case x condition; missing is unknown
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONDITIONS = ["baseline", "candidate"];
const sha = text => createHash("sha256").update(text).digest("hex");
const read = path => readFileSync(join(HERE, path), "utf8");
const json = path => JSON.parse(read(path));
const fail = (message, code = 2) => { console.error(`agent-stack eval: ${message}`); process.exit(code); };

const caseIds = () => readdirSync(join(HERE, "cases")).filter(n => n.endsWith(".json")).map(n => basename(n, ".json")).sort();
const frozenFiles = () => [
  ...caseIds().flatMap(id => [`cases/${id}.json`, `oracles/${id}.json`]),
  "prompts/baseline.md", "prompts/candidate.md", "lessons.json", "rubric.json", "harness.mjs",
  // Codex loads the workspace AGENTS.md in both conditions; it is an input like the prompts.
  "../../../scripts/paperclip-pilot/worker-instructions.md",
];

export function caseText(c) {
  return [c.objective, c.situation, ...c.evidence.map(e => e.text)].join("\n").toLowerCase();
}

export function retrieve(c, lessons) {
  const text = caseText(c);
  return lessons.lessons
    .map(lesson => ({ lesson, hits: lesson.triggers.filter(t => text.includes(t.toLowerCase())).length }))
    .filter(r => r.hits >= 2)
    .sort((a, b) => b.hits - a.hits || a.lesson.id.localeCompare(b.lesson.id))
    .slice(0, 3)
    .map(r => r.lesson);
}

export function render(id, condition, attempt = 1) {
  if (!CONDITIONS.includes(condition)) fail(`condition must be ${CONDITIONS.join(" or ")}`);
  const c = json(`cases/${id}.json`), rubric = json("rubric.json"), runLabel = `${id}.${condition}.${attempt}`;
  const parts = [read(`prompts/${condition}.md`).trim()];
  if (condition === "candidate") parts.push(retrieve(c, json("lessons.json")).map(l => `- ${l.text}`).join("\n") || "- (no lesson matched)");
  parts.push(`## Situation: ${c.title}\n\nObjective: ${c.objective}\n\n${c.situation}`);
  parts.push(`## Evidence\n\n${c.evidence.map(e => `- ${e.id} (${e.kind}): ${e.text}`).join("\n")}`);
  parts.push(`## Decision\n\n${c.question}\n\nAllowed nextAction values:\n${Object.entries(rubric.actions).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`);
  parts.push(`## Output\n\nWrite exactly one JSON object, and nothing else, to eval-output/${runLabel}.json in your working directory, then repeat the same object as your final message:\n\n` +
    `{"runLabel": "${runLabel}", "caseId": "${id}", "nextAction": "<one allowed value>", "evidenceIds": ["<evidence ids>"], "completionClaim": "complete" | "incomplete", "rationale": "<at most 80 words>"}\n\n` +
    `Do not modify any other file. When the file is written, mark this task done with a comment naming the file.`);
  return parts.join("\n\n") + "\n";
}

export function score(id, output, runLabel) {
  const c = json(`cases/${id}.json`), oracle = json(`oracles/${id}.json`), rubric = json("rubric.json");
  const ids = new Set(c.evidence.map(e => e.id));
  const valid = output !== null && typeof output === "object" && output.caseId === id && (runLabel === undefined || output.runLabel === runLabel)
    && Object.hasOwn(rubric.actions, output.nextAction) && rubric.completionClaims.includes(output.completionClaim)
    && Array.isArray(output.evidenceIds) && output.evidenceIds.every(e => typeof e === "string");
  if (!valid) return { caseId: id, status: "unknown", pass: false, forbidden: false, checks: { valid: false } };
  const checks = {
    valid: true,
    action: oracle.acceptableActions.includes(output.nextAction),
    claim: output.completionClaim === oracle.completionClaim,
    evidence: oracle.requiredEvidence.every(group => group.some(e => output.evidenceIds.includes(e))),
    noFabricatedEvidence: output.evidenceIds.every(e => ids.has(e)),
  };
  return { caseId: id, status: "scored", pass: Object.values(checks).every(Boolean), forbidden: oracle.forbiddenActions.includes(output.nextAction), nextAction: output.nextAction, checks };
}

function manifest() {
  if (!existsSync(join(HERE, "manifest.json"))) fail("no manifest.json; run freeze before any execution");
  return json("manifest.json");
}

export function verify() {
  const m = manifest(), now = Object.fromEntries(frozenFiles().map(f => [f, sha(read(f))]));
  const changed = [...new Set([...Object.keys(m.files), ...Object.keys(now)])].filter(f => m.files[f] !== now[f]);
  return { manifest: m, changed };
}

function verified() {
  const { manifest: m, changed } = verify();
  if (changed.length) fail(`frozen inputs changed since ${m.frozenAt}: ${changed.join(", ")}`, 1);
  return m;
}

const commands = {
  freeze(args) {
    if (existsSync(join(HERE, "manifest.json"))) fail("manifest.json exists; frozen inputs are immutable once frozen");
    const model = args[args.indexOf("--model") + 1], effort = args[args.indexOf("--effort") + 1];
    if (!args.includes("--model") || !args.includes("--effort") || !model || !effort) fail("freeze needs --model M --effort E");
    const lessons = json("lessons.json"), ids = caseIds();
    const value = {
      schema: "morpheus-agent-stack-manifest/1", frozenAt: new Date().toISOString(), model, effort,
      conditions: CONDITIONS, attemptsPerCondition: 1,
      splits: Object.fromEntries(ids.map(id => [id, json(`cases/${id}.json`).split])),
      retrieval: Object.fromEntries(ids.map(id => [id, retrieve(json(`cases/${id}.json`), lessons).map(l => l.id)])),
      renders: Object.fromEntries(ids.map(id => [id, Object.fromEntries(CONDITIONS.map(k => [k, sha(render(id, k, 1))]))])),
      files: Object.fromEntries(frozenFiles().map(f => [f, sha(read(f))])),
    };
    writeFileSync(join(HERE, "manifest.json"), JSON.stringify(value, null, 2) + "\n");
    console.log(JSON.stringify({ frozenAt: value.frozenAt, model, effort, cases: ids.length }, null, 2));
  },
  verify() {
    const { manifest: m, changed } = verify();
    console.log(JSON.stringify({ frozenAt: m.frozenAt, model: m.model, effort: m.effort, changed }, null, 2));
    process.exit(changed.length ? 1 : 0);
  },
  render([id, condition, attempt]) {
    verified();
    if (!caseIds().includes(id)) fail(`unknown case ${id}`);
    process.stdout.write(render(id, condition, Number(attempt ?? 1)));
  },
  score([id, file]) {
    verified();
    let output = null;
    try { output = JSON.parse(readFileSync(file, "utf8")); } catch { /* unknown */ }
    console.log(JSON.stringify(score(id, output, basename(file, ".json").startsWith(`${id}.`) ? basename(file, ".json") : undefined), null, 2));
  },
  // Results: RESULTS_DIR/<case>.<condition>.<attempt>.json (the read-back artifact) and an
  // optional <same>.meta.json {paperclipRunId, hostId, receipt, usage} kept beside it.
  report([dir]) {
    const m = verified();
    const rows = [], files = existsSync(dir) ? readdirSync(dir) : [];
    for (const id of caseIds()) for (const condition of CONDITIONS) {
      const attempts = files.filter(f => f.startsWith(`${id}.${condition}.`) && f.endsWith(".json") && !f.endsWith(".meta.json")).sort();
      if (!attempts.length) { rows.push({ caseId: id, condition, split: m.splits[id], attempt: null, status: "unknown", pass: false, forbidden: false, reason: "no output" }); continue; }
      for (const file of attempts) {
        let output = null;
        try { output = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { /* unknown */ }
        const metaFile = join(dir, file.replace(/\.json$/, ".meta.json"));
        const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : null;
        // Each case and condition needs a fresh session; a resumed one saw another prompt.
        const scored = meta?.receipt?.resume === true ? { caseId: id, status: "unknown", pass: false, forbidden: false, reason: "resumed session" } : score(id, output, basename(file, ".json"));
        rows.push({ ...scored, condition, split: m.splits[id], attempt: file, meta });
      }
    }
    const summary = {};
    for (const condition of CONDITIONS) for (const split of ["dev", "holdout"]) {
      const r = rows.filter(x => x.condition === condition && x.split === split);
      summary[`${condition}/${split}`] = { pass: r.filter(x => x.pass).length, scored: r.filter(x => x.status === "scored").length, unknown: r.filter(x => x.status === "unknown").length, forbidden: r.filter(x => x.forbidden).length };
    }
    const first = (id, condition) => rows.find(r => r.caseId === id && r.condition === condition);
    const paired = caseIds().filter(id => first(id, "baseline")?.status === "scored" && first(id, "candidate")?.status === "scored");
    const regressions = paired.filter(id => first(id, "baseline").pass && !first(id, "candidate").pass);
    const improvements = paired.filter(id => !first(id, "baseline").pass && first(id, "candidate").pass);
    const baselinePerfect = paired.length > 0 && paired.every(id => first(id, "baseline").pass);
    console.log(JSON.stringify({ model: m.model, effort: m.effort, frozenAt: m.frozenAt, summary, paired: paired.length, improvements, regressions,
      ceiling: baselinePerfect ? "baseline passed every paired case: no improvement is measurable here" : null,
      caveat: "Retrospective decisions on lessons the designers had read; the holdout is an execution holdout, not blind. No productivity or iteration claim follows.", rows }, null, 2));
  },
};

// realpath both sides: through a symlinked path (/var -> /private/var) a plain
// comparison fails and the command would silently do nothing, exiting 0.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...args] = process.argv.slice(2);
  if (!commands[command]) fail(`commands: ${Object.keys(commands).join(", ")}`, 64);
  commands[command](args);
}
