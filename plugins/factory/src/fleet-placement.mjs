// Kept outside the legacy strict bridge config so already-open sessions can
// still start the previous bridge and supervise their original runs.
import { join } from "node:path";
import { home } from "./config.mjs";
import { atomic, initStore, readJSON } from "./store.mjs";

const path = () => join(home(), "fleet-placement.json");

export async function readPlacement() {
  const value = await readJSON(path(), { placement: "local" });
  if (!["local", "fleet"].includes(value?.placement)) throw new Error("Invalid saved Factory placement.");
  return value.placement;
}

export async function writePlacement(placement) {
  if (!["local", "fleet"].includes(placement)) throw new Error("Use placement local or placement fleet");
  await initStore();
  await atomic(path(), { placement });
  return placement;
}
