// The operator's default speed for local Factory Codex workers behind a subscription gateway.
// Kept outside the legacy strict bridge config, like the placement preference, so an
// already-open session can still start the previous bridge. Absent means Standard.
import { join } from "node:path";
import { home, workerSpeed } from "./config.mjs";
import { atomic, initStore, readJSON } from "./store.mjs";

const path = () => join(home(), "worker-speed.json");

export async function readCodexSpeed() {
  const value = await readJSON(path(), { codex: "standard" });
  if (!workerSpeed.safeParse(value?.codex).success) throw new Error("Invalid saved Factory Codex worker speed.");
  return value.codex;
}

export async function writeCodexSpeed(speed) {
  if (!workerSpeed.safeParse(speed).success) throw new Error("Use codex-speed standard or codex-speed fast");
  await initStore();
  await atomic(path(), { codex: speed });
  return speed;
}
