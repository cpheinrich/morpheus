#!/usr/bin/env -S pnpm exec tsx
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { exportCloseout, readFrozenFile } from "./export.js";
import { renderCloseout } from "./markdown.js";
import { validateHistory } from "./history.js";

try {
  const { values } = parseArgs({ options: {
    repo: { type: "string", default: "." }, snapshot: { type: "string" },
    api: { type: "string" }, company: { type: "string" }, issue: { type: "string" }, thread: { type: "string" },
    render: { type: "boolean" }, "check-history": { type: "boolean" },
    base: { type: "string" }, head: { type: "string" },
  } });
  const required = (key: keyof typeof values): string => {
    const value = values[key];
    if (typeof value !== "string" || !value) throw new Error("missing required option");
    return value;
  };
  const repo = resolve(values.repo!);
  if (values.render && values["check-history"]) throw new Error("choose one command");
  if (values["check-history"]) {
    console.log(JSON.stringify(await validateHistory(repo, required("base"), required("head"))));
  } else if (values.render) {
    console.log(JSON.stringify(await renderCloseout(repo, required("snapshot"))));
  } else {
    const path = required("snapshot");
    const result = await exportCloseout(repo, { baseUrl: required("api"), companyId: required("company"),
      issueId: required("issue"), threadId: required("thread") }, () => readFrozenFile(repo, path));
    console.log(JSON.stringify({ path: result.path, snapshotId: result.snapshotId, created: result.created }));
  }
} catch {
  // Parser, filesystem and upstream prose can contain credentials or private paths.
  console.error("Closeout refused. Check the frozen-input contract, exact target and local file safety; no task status was changed.");
  process.exitCode = 1;
}
