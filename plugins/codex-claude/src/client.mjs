import http from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, stat, open } from "node:fs/promises";
import { home } from "./config.mjs";
import { initStore } from "./store.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
export async function call(method, args = {}) {
  try {
    return await request(method, args);
  } catch (e) {
    if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e;
  }
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
      return await request(method, args);
    } catch (e) {
      if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e;
    }
    const info = await stat(lock).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 30000)
      await rm(lock, { recursive: true, force: true });
    await sleep(100);
  }
  if (!owned) throw new Error("Bridge startup busy; retry.");
  try {
    try {
      return await request(method, args);
    } catch (e) {
      if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e;
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
        return await request(method, args);
      } catch (e) {
        if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e;
      }
    }
    throw new Error("Bridge did not start; inspect service.log.");
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
