import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getFirestore, onSnapshot, terminate } from "firebase/firestore";

// The supervisor also enforces its last confirmed lease on a separate timer.
const slowLinkOperations = new Set(["heartbeat", "claim", "inspect", "renew", "question", "finish"]);

function requestTimeout(op) {
  if (op === "upload" || op === "download") return 45_000;
  return slowLinkOperations.has(op) ? 20_000 : 8_000;
}

const transientNetworkCodes = new Set([
  "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);

async function boundedRequest(ms, request) {
  const signal = AbortSignal.timeout(ms);
  let onTimeout;
  const timeout = new Promise((_, reject) => {
    onTimeout = () => reject(signal.reason);
    signal.addEventListener("abort", onTimeout, { once: true });
  });
  try { return await Promise.race([request(signal), timeout]); }
  catch (error) {
    if (error?.retryable !== false &&
        (signal.aborted || transientNetworkCodes.has(error?.cause?.code) || error?.code === "auth/network-request-failed"))
      throw Object.assign(new Error("Temporary Factory transport failure.", { cause: error }), { retryable: true });
    throw error;
  } finally { signal.removeEventListener("abort", onTimeout); }
}

async function requestFleet(endpoint, user, op, body, signal) {
  const token = await user.getIdToken();
  signal.throwIfAborted();
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, op }),
  });
  if (response.ok) return response.json();
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  if (!retryable && (op === "inspect" || op === "renew")) {
    void response.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`Factory authority request rejected (${response.status}).`), { retryable: false });
  }
  const value = await response.json().catch(() => null);
  throw Object.assign(new Error(value?.error ?? "Factory service rejected the operation"), { retryable });
}

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

export async function connectFleet(config, signIn = signInWithEmailAndPassword) {
  const endpoint = new URL("/v1", config.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("Factory service must use HTTPS");
  const app = initializeApp(config.firebase, randomUUID());
  let auth, user, db;
  try {
    auth = getAuth(app);
    ({ user } = await signIn(auth, config.email, config.password));
    db = getFirestore(app, config.databaseId);
  } catch (error) {
    await deleteApp(app);
    throw error;
  }
  return {
    call: (op, body) => boundedRequest(requestTimeout(op),
      signal => requestFleet(endpoint, user, op, body, signal)),
    listen(wake, error) { return onSnapshot(doc(db, "factorySignals", user.uid), wake, error); },
    async close() {
      try {
        await terminate(db);
        await signOut(auth);
      } finally { await deleteApp(app); }
    },
  };
}

// The service resolves a repeated message ID to the same task transactionally.
export async function submitFleetTask(client, body) {
  try { return await client.call("submit", body); }
  catch (error) {
    if (error?.retryable !== true) throw error;
  }
  try { return await client.call("submit", body); }
  catch (error) {
    if (error?.retryable !== true) throw error;
    throw new Error(`Factory submission acknowledgement is uncertain. Retry the same message ID: ${body.messageId}.`, { cause: error });
  }
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
