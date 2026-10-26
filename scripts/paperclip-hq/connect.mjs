import { readFile, lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { callableClient } from './lib/client.js';
import { createConnector } from './lib/connector.js';

const path = process.argv[2];
if (!path || process.argv.length !== 3 || !isAbsolute(path)) throw new Error('Usage: node connect.mjs /absolute/private/connector.json');
async function privateFile(path, maxBytes) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > maxBytes || (process.getuid && stat.uid !== process.getuid())) throw new Error('Expected bounded owner-only regular file');
  return readFile(path, 'utf8');
}
const config = z.object({
  companyId: z.string().uuid(), controllerId: z.string().min(1).max(128), connectorId: z.string().min(1).max(128),
  baseUrl: z.string().url(), tokenFile: z.string(), directory: z.string(), bridgeClientModule: z.string(),
}).strict().parse(JSON.parse(await privateFile(path, 16 * 1024)));
for (const path of [config.tokenFile, config.directory, config.bridgeClientModule]) if (!isAbsolute(path)) throw new Error('Connector paths must be absolute');
// Explicit existing client module; never install/hot-replace the personal plugin.
const modulePath = await realpath(config.bridgeClientModule);
const { call } = await import(pathToFileURL(modulePath).href);
if (typeof call !== 'function') throw new Error('Existing native bridge client unavailable');
const backend = callableClient(config.baseUrl, async () => {
  const token = (await privateFile(config.tokenFile, 16 * 1024)).trim();
  if (!token || /\s/.test(token)) throw new Error('Invalid Firebase ID token file');
  return token;
});
try {
  const result = await createConnector({ ...config, backend, bridge: call }).tick();
  console.log(JSON.stringify({ observed: result.observed, receiptPass: 'complete' }));
} catch {
  console.error('HQ connector pass failed. Preserve journals and inspect the exact operation; no automatic provider retry was requested.');
  process.exitCode = 1;
}
