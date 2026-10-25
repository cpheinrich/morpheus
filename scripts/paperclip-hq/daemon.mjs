import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { callableClient } from './lib/client.js';
import { createConnector } from './lib/connector.js';
import { paperclipProjection } from './lib/projection.js';
import { privateFile, firebaseToken, daemonOwnership, runDaemon, boundedBridgeCall } from './lib/runtime.js';

const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error('Usage: node daemon.mjs /absolute/private/connector.json');
const config = z.object({
  companyId: z.string().uuid(), controllerId: z.string().min(1).max(128), connectorId: z.string().min(1).max(128),
  baseUrl: z.string().url(), credentialsFile: z.string(), directory: z.string(), bridgeClientModule: z.string(),
  paperclipBaseUrl: z.string().url(), paperclipTokenFile: z.string(), pollMs: z.number().int().min(5000).max(60000).default(15000),
}).strict().parse(JSON.parse(await privateFile(path)));
for (const value of [config.credentialsFile, config.directory, config.bridgeClientModule, config.paperclipTokenFile]) if (!isAbsolute(value)) throw new Error('Connector paths must be absolute');
const release = await daemonOwnership(config.directory);
const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.once('SIGTERM', stop); process.once('SIGINT', stop);
try {
  const { call } = await import(pathToFileURL(await realpath(config.bridgeClientModule)).href);
  if (typeof call !== 'function') throw new Error('Existing native bridge client unavailable');
  const backend = callableClient(config.baseUrl, firebaseToken(config.credentialsFile));
  const connector = createConnector({ ...config, backend, bridge: (method, args) => boundedBridgeCall(() => call(method, args)) });
  const observe = paperclipProjection({ baseUrl: config.paperclipBaseUrl, companyId: config.companyId, token: async () => {
    const token = (await privateFile(config.paperclipTokenFile)).trim();
    if (!token || /\s/.test(token)) throw new Error('Invalid Paperclip token');
    return token;
  } });
  await runDaemon({ signal: shutdown.signal, pollMs: config.pollMs, pass: async () => {
    await connector.tick(shutdown.signal);
    if (!shutdown.signal.aborted) await backend('publish', await observe());
  }, report: state => console.log(JSON.stringify({ state, at: Date.now() })) });
} catch {
  console.error('HQ daemon stopped; inspect private ownership/configuration without deleting journals.');
  process.exitCode = 1;
} finally {
  await release();
  process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
}
