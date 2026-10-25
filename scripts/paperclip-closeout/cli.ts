#!/usr/bin/env -S pnpm exec tsx
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { exportCloseout, readFrozenFile } from "./export.js";

try {
  const { values } = parseArgs({ options: {
    repo: { type: "string", default: "." }, snapshot: { type: "string" },
    api: { type: "string" }, company: { type: "string" }, issue: { type: "string" }, thread: { type: "string" },
  } });
  const required = (key: keyof typeof values): string => {
    const value = values[key];
    if (!value) throw new Error("missing required option");
    return value;
  };
  const repo = resolve(values.repo!);
  const path = required("snapshot");
  const result = await exportCloseout(repo, { baseUrl: required("api"), companyId: required("company"),
    issueId: required("issue"), threadId: required("thread") }, () => readFrozenFile(repo, path));
  console.log(JSON.stringify({ path: result.path, snapshotId: result.snapshotId, created: result.created }));
} catch {
  // Parser, filesystem and upstream prose can contain credentials or private paths.
  console.error("Closeout refused. Check the frozen-input contract, exact target and local file safety; no task status was changed.");
  process.exitCode = 1;
}
