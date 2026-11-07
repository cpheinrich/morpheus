import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getFirestore, onSnapshot, terminate } from "firebase/firestore";

export async function readFleetConfig(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 65536)
      throw new Error("Factory credentials require a private owner-only configuration file");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}

export async function connectFleet(config) {
  const endpoint = new URL("/v1", config.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("Factory service must use HTTPS");
  const app = initializeApp(config.firebase);
  const auth = getAuth(app);
  const { user } = await signInWithEmailAndPassword(auth, config.email, config.password);
  const db = getFirestore(app, config.databaseId);
  return {
    async call(op, body) {
      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(op === "upload" || op === "download" ? 45_000 : 8_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, op }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Factory service rejected the operation");
      return value;
    },
    listen(wake, error) { return onSnapshot(doc(db, "factorySignals", user.uid), wake, error); },
    async close() {
      await terminate(db);
      await signOut(auth);
    },
  };
}

export function waitForFleetTask(client, body, seconds = 25) {
  let stop;
  return new Promise((resolve, reject) => {
    let busy = false;
    let latest;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        latest = await client.call("get", body);
        if (!["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING"].includes(latest.task.state)) resolve(latest);
      } catch (error) { reject(error); }
      finally { busy = false; }
    };
    const unsubscribe = client.listen(read, () => {});
    const interval = setInterval(read, 5000);
    const deadline = setTimeout(() => resolve(latest ?? { pending: true }), seconds * 1000);
    void read();
    stop = () => {
      unsubscribe();
      clearInterval(interval);
      clearTimeout(deadline);
    };
  }).finally(() => stop?.());
}
