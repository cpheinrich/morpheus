import http from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, stat, open, readFile, writeFile } from "node:fs/promises";
import { home } from "./config.mjs";
import { initStore } from "./store.mjs";
import { installationId } from "./installation.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unavailable = (error) =>
  ["ENOENT", "ECONNREFUSED", "ECONNRESET", "EPIPE"].includes(error.code);
const legacyWaitFile = () => join(home(), "legacy-upgrade-wait.json");
async function enforceLegacyWait() {
  let marker;
  try {
    marker = JSON.parse(await readFile(legacyWaitFile(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") await rm(legacyWaitFile(), { force: true });
    return;
  }
  const socket = await stat(join(home(), "bridge.sock")).catch(() => null);
  if (
    !socket ||
    socket.ino !== marker.ino ||
    socket.mtimeMs !== marker.mtimeMs ||
    Date.now() >= marker.until
  ) {
    await rm(legacyWaitFile(), { force: true });
    return;
  }
  const seconds = Math.ceil((marker.until - Date.now()) / 1000);
  throw new Error(
    `A legacy bridge is idling out safely; retry in about ${seconds} seconds without contacting it.`,
  );
}
async function beginLegacyWait() {
  const socket = await stat(join(home(), "bridge.sock"));
  await writeFile(
    legacyWaitFile(),
    JSON.stringify({
      until: Date.now() + 360000,
      ino: socket.ino,
      mtimeMs: socket.mtimeMs,
    }),
    { mode: 0o600 },
  );
}
function request(method, args) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: join(home(), "bridge.sock"),
        path: "/rpc",
        method: "POST",
        timeout: 40000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (b) => {
          text += b;
          if (text.length > 2 * 1024 * 1024)
            req.destroy(new Error("Response too large"));
        });
        res.on("end", () => {
          try {
            const v = JSON.parse(text);
            v.error ? reject(new Error(v.error)) : resolve(v.result);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Bridge timeout")));
    req.end(JSON.stringify({ method, args }));
  });
}
export async function useRunning(method, args) {
  await enforceLegacyWait();
  let info;
  try {
    info = await request("ping", {});
  } catch (e) {
    if (unavailable(e)) return { found: false };
    throw e;
  }
  if (info.installationId !== installationId) {
    try {
      await request("shutdown", {});
    } catch (e) {
      if (unavailable(e)) return { found: false };
      if (e.message === "Unknown bridge operation") {
        await beginLegacyWait();
        throw new Error(
          "The legacy bridge does not support safe live replacement. Active work was left untouched; wait about six minutes without retrying, then try again.",
        );
      }
      throw new Error(
        `An older bridge service is still running and cannot be replaced safely: ${e.message}`,
      );
    }
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      try {
        const replacement = await request("ping", {});
        if (replacement.installationId === installationId)
          return { found: true, result: await request(method, args) };
      } catch (e) {
        if (unavailable(e)) return { found: false };
        throw e;
      }
    }
    throw new Error("The previous bridge service did not stop after upgrade.");
  }
  return { found: true, result: await request(method, args) };
}
export async function call(method, args = {}) {
  const current = await useRunning(method, args);
  if (current.found) return current.result;
  await initStore();
  const lock = join(home(), "startup.lock");
  let owned = false;
  for (let i = 0; i < 100; i++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      owned = true;
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    try {
      const current = await useRunning(method, args);
      if (current.found) return current.result;
    } catch (e) {
      if (!unavailable(e)) throw e;
    }
    const info = await stat(lock).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 30000)
      await rm(lock, { recursive: true, force: true });
    await sleep(100);
  }
  if (!owned) throw new Error("Bridge startup busy; retry.");
  try {
    try {
      const current = await useRunning(method, args);
      if (current.found) return current.result;
    } catch (e) {
      if (!unavailable(e)) throw e;
    }
    await rm(join(home(), "bridge.sock"), { force: true });
    const log = await open(join(home(), "service.log"), "a", 0o600);
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./service.mjs", import.meta.url))],
      { stdio: ["ignore", log.fd, log.fd], detached: true, env: process.env },
    );
    child.on("error", () => {});
    child.unref();
    await log.close();
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      try {
        const current = await useRunning(method, args);
        if (current.found) return current.result;
      } catch (e) {
        if (!unavailable(e)) throw e;
      }
    }
    throw new Error("Bridge did not start; inspect service.log.");
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
