#!/usr/bin/env node
// One fresh Codex subscription quota read for the Paperclip supervisor.
//
// Delegates to Morpheus's existing nativeQuota (dist/cd/quota-reader.js) so the
// account protocol, ordinaryUsageAllowed check and reader cleanup live in one place.
// Prints only {observedAt, source, windows}; failures print a fixed category on
// stderr and exit 1 — provider text is never echoed because it can carry credentials.
//
//   node quota.mjs --reader /abs/morpheus/dist/cd/quota-reader.js --codex /abs/codex [--cwd DIR]
import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";

const options = {};
for (let i = 2; i < process.argv.length; i += 2) options[process.argv[i]?.replace(/^--/, "")] = process.argv[i + 1];
if (![options.reader, options.codex].every(value => typeof value === "string" && isAbsolute(value))) {
  console.error("usage: quota.mjs --reader /abs/quota-reader.js --codex /abs/codex [--cwd DIR]");
  process.exit(64);
}
try {
  const { nativeQuota } = await import(pathToFileURL(options.reader).href);
  const snapshot = await nativeQuota([options.codex], options.cwd ?? process.cwd(), new Date().toISOString());
  const windows = snapshot.windows.map(({ id, usedPercent, resetsAt }) => ({ id, usedPercent, resetsAt }));
  process.stdout.write(JSON.stringify({ observedAt: snapshot.observedAt, source: snapshot.source, windows }) + "\n");
} catch (error) {
  // nativeQuota's own messages are fixed categories with phase and elapsed time only.
  const message = error instanceof Error && error.message.startsWith("Codex account quota ") ? error.message : "Codex account quota reader unavailable";
  console.error(message);
  process.exit(1);
}
