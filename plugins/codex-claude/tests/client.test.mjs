import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useRunning } from "../src/client.mjs";
import { installationId } from "../src/installation.mjs";

async function staleService(root, options = {}) {
  await mkdir(root, { recursive: true });
  const methods = [];
  let activeInstallation = "old";
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { method } = JSON.parse(body);
    methods.push(method);
    response.setHeader("Content-Type", "application/json");
    if (method === "ping") {
      response.end(
        JSON.stringify({ result: { installationId: activeInstallation } }),
      );
      if (options.closeAfterPing) server.close();
    } else if (options.shutdownError)
      response.end(JSON.stringify({ error: options.shutdownError }));
    else if (method === "shutdown" && options.replaceOnShutdown) {
      activeInstallation = installationId;
      response.end(JSON.stringify({ result: { stopping: true } }));
    } else if (method === "config")
      response.end(JSON.stringify({ result: { mode: "manual" } }));
    else {
      response.end(JSON.stringify({ result: { stopping: true } }));
      server.close();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(join(root, "bridge.sock"), resolve);
  });
  return { server, methods };
}

test("client replaces an idle service from an earlier installation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "client-upgrade-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = root;
  const old = await staleService(root);
  t.after(async () => {
    old.server.close();
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  assert.deepEqual(await useRunning("config", {}), { found: false });
  assert.deepEqual(old.methods, ["ping", "shutdown"]);
});

test("client preserves a stale service that refuses an unsafe upgrade", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "client-busy-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = root;
  const old = await staleService(root, {
    shutdownError: "Active Claude runs prevent upgrade",
  });
  t.after(async () => {
    await new Promise((resolve) => old.server.close(resolve));
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    useRunning("config", {}),
    /cannot be replaced safely: Active Claude runs/,
  );
  assert.deepEqual(old.methods, ["ping", "shutdown"]);
});

test("client accepts a stale service disappearing before shutdown", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "client-departed-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = root;
  const old = await staleService(root, { closeAfterPing: true });
  t.after(async () => {
    old.server.close();
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  assert.deepEqual(await useRunning("config", {}), { found: false });
  assert.deepEqual(old.methods, ["ping"]);
});

test("client uses a concurrent replacement instead of timing out", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "client-replaced-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = root;
  const replacement = await staleService(root, { replaceOnShutdown: true });
  t.after(async () => {
    await new Promise((resolve) => replacement.server.close(resolve));
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  assert.deepEqual(await useRunning("config", {}), {
    found: true,
    result: { mode: "manual" },
  });
  assert.deepEqual(replacement.methods, ["ping", "shutdown", "ping", "config"]);
});
