import { join } from "node:path";
import { open } from "node:fs/promises";
import { home } from "./config.mjs";
import { atomic, initStore, readJSON } from "./store.mjs";
// Claude Code hands subscription windows to its status line command and nowhere else
// a plugin can read without its OAuth token. Record only the windows, never the token.
const file = () => join(home(), "claude-usage.json");
export async function recordClaudeUsage(input, now = Date.now()) {
  const limits = input?.rate_limits;
  if (!limits || typeof limits !== "object") return null;
  const rateLimits = {};
  for (const name of ["five_hour", "seven_day"]) {
    const v = limits[name];
    if (v && Number.isFinite(v.used_percentage) && Number.isFinite(v.resets_at))
      rateLimits[name] = {
        used_percentage: v.used_percentage,
        resets_at: v.resets_at,
      };
  }
  if (!Object.keys(rateLimits).length) return null;
  const snapshot = { recordedAt: now, rateLimits };
  await initStore();
  await atomic(file(), snapshot);
  return snapshot;
}
export const readClaudeUsage = () => readJSON(file(), null);
export function statusText(snapshot) {
  const part = (label, v) =>
    v ? `${label} ${Math.round(v.used_percentage)}%` : null;
  return [
    part("5h", snapshot?.rateLimits?.five_hour),
    part("7d", snapshot?.rateLimits?.seven_day),
  ]
    .filter(Boolean)
    .join(" · ");
}
// Hook input names no model, so read the latest assistant reply from the transcript tail.
// Before the first reply this is unknown, and Codex keeps its own configured default.
export async function transcriptModel(path, tailBytes = 262144) {
  if (typeof path !== "string" || !path.endsWith(".jsonl")) return null;
  let file;
  try {
    file = await open(path, "r");
    const { size } = await file.stat();
    const start = Math.max(0, size - tailBytes);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n").reverse();
    for (const line of lines) {
      if (!line.includes('"assistant"')) continue;
      try {
        const model = JSON.parse(line).message?.model;
        if (typeof model === "string" && /^claude-/.test(model)) return model;
      } catch {}
    }
  } catch {
  } finally {
    await file?.close();
  }
  return null;
}
