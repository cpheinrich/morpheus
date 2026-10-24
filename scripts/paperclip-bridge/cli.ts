#!/usr/bin/env -S pnpm exec tsx
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { operate, prepare, recordPath, savePrepared } from "./bridge.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  repo: { type: "string", default: "." }, roadmap: { type: "string" }, job: { type: "string" },
  acceptance: { type: "string" }, task: { type: "string" }, title: { type: "string" },
  api: { type: "string" }, company: { type: "string" }, project: { type: "string" }, agent: { type: "string" },
  record: { type: "string" }, issue: { type: "string" }, evidence: { type: "string" },
  "token-env": { type: "string" }, apply: { type: "boolean", default: false },
} });
const required = (name: keyof typeof values) => {
  const value = values[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} is required`);
  return value;
};
try {
  if (positionals.length !== 1) throw new Error("expected prepare, submit, link, status or reconcile");
  const repo = resolve(values.repo!);
  const command = positionals[0];
  if (command === "prepare") {
    const record = await prepare(repo, { roadmapId: required("roadmap"), job: required("job"),
      acceptance: values.acceptance, task: required("task"), title: required("title"),
      baseUrl: required("api"), companyId: required("company"), projectId: required("project"), agentId: required("agent") });
    if (values.apply) await savePrepared(repo, record);
    console.log(JSON.stringify({ path: recordPath(record.plan), record }, null, 2));
  } else if (["submit", "link", "status", "reconcile"].includes(command!)) {
    if (command !== "status" && !values.apply) throw new Error("--apply is required; inspect the committed prepared record first");
    const envName = required("token-env");
    if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) throw new Error("invalid token environment reference");
    const token = process.env[envName];
    if (!token) throw new Error("private token environment reference is empty");
    const result = await operate(repo, required("record"), { command: command as "submit" | "link" | "status" | "reconcile", token, issueId: values.issue, evidence: values.evidence });
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error("expected prepare, submit, link, status or reconcile");
} catch (err) {
  // Child-process errors may include config or provider text. Only our fixed boundary errors are public.
  console.error(err instanceof Error && !("stderr" in err) && err.name !== "ZodError" ? err.message : "bridge validation failed; inspect local source and inputs");
  process.exitCode = 1;
}
