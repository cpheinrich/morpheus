import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer, request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const claudeOverage = event => event?.type === 'rate_limit_event' && event.rate_limit_info?.isUsingOverage === true;

function streamEvent(chunks) {
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

async function relay(child, limit, closeInput) {
  let pending = [];
  let bytes = 0;
  for await (const chunk of child.stdout) {
    bytes += chunk.length;
    if (!process.stdout.write(chunk)) await once(process.stdout, 'drain');
    if (bytes > limit) return false;
    let offset = 0;
    for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, offset)) {
      pending.push(chunk.subarray(offset, end));
      offset = end + 1;
      const event = streamEvent(pending);
      pending = [];
      if (claudeOverage(event)) return false;
      if (event?.type === 'result') closeInput();
    }
    if (offset < chunk.length) pending.push(chunk.subarray(offset));
  }
  return true;
}

// Restricted workers can reach only their per-invocation gateway relay. The
// shared guardian owns the relay and child together, including on interruption.
async function gatewayRelay(origin, token, model, capability) {
  const gateway = new URL(origin);
  const send = gateway.protocol === 'https:' ? secureRequest : request;
  const server = createServer(async (incoming, outgoing) => {
    const path = /^\/v1\/messages(?:\/count_tokens)?(?:\?beta=true)?$/.test(incoming.url);
    if (incoming.method !== 'POST' || !path) { outgoing.writeHead(404).end(); return; }
    if (incoming.headers.authorization !== `Bearer ${capability}`) { outgoing.writeHead(403).end(); return; }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { outgoing.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      const body = JSON.parse(data);
      if (body.model !== model || body.speed === 'fast') { outgoing.writeHead(403).end(); return; }
      const headers = { 'content-type': 'application/json', 'content-length': data.length, authorization: `Bearer ${token}` };
      for (const key of ['anthropic-version', 'anthropic-beta', 'user-agent', 'x-app', 'accept']) {
        if (incoming.headers[key]) headers[key] = incoming.headers[key];
      }
      const upstream = send(origin + incoming.url, { method: 'POST', headers, timeout: 120_000 }, response => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      });
      upstream.on('error', () => outgoing.headersSent ? outgoing.destroy() : outgoing.writeHead(502).end());
      upstream.on('timeout', () => upstream.destroy());
      outgoing.on('close', () => upstream.destroy());
      upstream.end(data);
    } catch { outgoing.writeHead(400).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function restrictedLaunch(command, args, roots) {
  const { CLAUDE_CONFIG_DIR: home, ANTHROPIC_AUTH_TOKEN: token, ANTHROPIC_BASE_URL: origin, ...env } = process.env;
  if (process.platform !== 'darwin' || !home || !token || !origin) throw new Error('Workspace sandbox unavailable');
  const temp = join(home, 'tmp');
  await mkdir(temp, { recursive: true, mode: 0o700 });
  const capability = randomBytes(32).toString('hex');
  const relay = await gatewayRelay(origin, token, args[args.indexOf('--model') + 1], capability);
  const { port } = relay.address();
  const directories = [...roots, home].map((path, i) => [`WORKROOT${i}`, path]);
  const writable = directories.map(([name]) => `(subpath (param "${name}"))`).join(' ');
  const protectedPaths = roots.flatMap(path => ['.git', '.codex', '.agents'].map(entry => join(path, entry)));
  const protectedParams = protectedPaths.map((path, i) => [`PROTECTED${i}`, path]);
  const protectedRules = protectedParams.map(([name]) => `(subpath (param "${name}"))`).join(' ');
  const policy = `(version 1)(allow default)(deny file-write*)(allow file-write* ${writable} (literal "/dev/null"))` +
    `(deny file-write* ${protectedRules})(deny network*)(allow network-outbound (remote tcp "localhost:${port}"))`;
  const params = [...directories, ...protectedParams].flatMap(([name, path]) => ['-D', `${name}=${path}`]);
  return { relay, command: '/usr/bin/sandbox-exec', args: ['-p', policy, ...params, command, ...args],
    env: { ...env, HOME: home, CLAUDE_CONFIG_DIR: home, TMPDIR: temp, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_AUTH_TOKEN: capability } };
}

async function invokeClaude(limit, command, args, roots) {
  const launch = roots ? await restrictedLaunch(command, args, roots) : { command, args, env: process.env };
  const child = spawn(launch.command, launch.args, { env: launch.env, stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = once(child, 'close').catch(() => [127]);
  const closeInput = () => {
    process.stdin.unpipe(child.stdin);
    process.stdin.pause();
    child.stdin.end();
  };
  child.stdin.on('error', () => {});
  process.stdin.pipe(child.stdin);
  try {
    if (await relay(child, limit, closeInput)) {
      const [code] = await exited;
      return code ?? 1;
    }
  } finally {
    closeInput();
    child.stdout.destroy();
    child.unref();
    launch.relay?.close();
    launch.relay?.closeAllConnections();
  }
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [limit, roots, command, ...args] = process.argv.slice(2);
  process.exitCode = await invokeClaude(Number(limit), command, args, JSON.parse(roots)).catch(() => 1);
}
