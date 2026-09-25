import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useRunning } from "../src/client.mjs";

async function staleService(root, shutdownError = null) {
  await mkdir(root, { recursive: true });
  const methods = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { method } = JSON.parse(body);
    methods.push(method);
    response.setHeader("Content-Type", "application/json");
    if (method === "ping")
      response.end(JSON.stringify({ result: { installationId: "old" } }));
    else if (shutdownError)
      response.end(JSON.stringify({ error: shutdownError }));
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
  const old = await staleService(root, "Active Claude runs prevent upgrade");
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
