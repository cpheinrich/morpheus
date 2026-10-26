import { lstat, readFile, open, rename, mkdir, realpath, unlink } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { boundedResponse } from './projection.js';

export async function privateFile(path: string, maxBytes = 16 * 1024): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Private file requires an absolute path');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > maxBytes || (process.getuid && stat.uid !== process.getuid())) throw new Error('Expected bounded owner-only regular file');
  return readFile(path, 'utf8');
}
const credentialSchema = z.object({ apiKey: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), refreshToken: z.string().min(1).max(16_000).regex(/^\S+$/), uid: z.string().min(1).max(128) }).strict();

export async function boundedBridgeCall<T>(call: () => Promise<T>, ms = 90_000): Promise<T> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([call(), new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => reject(new Error('Bridge outcome unknown after deadline')), ms);
    })]);
  } finally { if (timer) globalThis.clearTimeout(timer); }
}

// Firebase Secure Token refresh is first-party. No service account or fixed ID token.
export function firebaseToken(credentialFile: string, fetchImpl = fetch, now = Date.now) {
  let cached: { value: string; expiresAt: number } | undefined;
  return async (): Promise<string> => {
    if (cached && cached.expiresAt > now() + 60_000) return cached.value;
    const credential = credentialSchema.parse(JSON.parse(await privateFile(credentialFile, 20 * 1024)));
    const body = await boundedResponse(await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${credential.apiKey}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credential.refreshToken }),
    }), 64 * 1024);
    const result = z.object({ id_token: z.string().min(1).max(16_000).regex(/^\S+$/), refresh_token: z.string().min(1).max(16_000).regex(/^\S+$/), user_id: z.string(), expires_in: z.string().regex(/^\d+$/) }).passthrough().parse(body);
    const seconds = Number(result.expires_in);
    if (result.user_id !== credential.uid || seconds <= 60 || seconds > 86400) throw new Error('Unexpected connector token identity or lifetime');
    // Persist rotation before using the ID token; a failed save refuses this refresh.
    if (result.refresh_token !== credential.refreshToken) {
      const temp = join(dirname(credentialFile), `.hq-credential-${randomUUID()}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ ...credential, refreshToken: result.refresh_token })); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temp, credentialFile);
    }
    cached = { value: result.id_token, expiresAt: now() + seconds * 1000 };
    return cached.value;
  };
}

export async function daemonOwnership(directory: string): Promise<() => Promise<void>> {
  if (!isAbsolute(directory)) throw new Error('Journal directory must be absolute');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('Journal directory must be private and owned');
  const path = join(await realpath(directory), 'daemon.lock');
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() })); await handle.sync(); }
  catch (error) { await handle.close(); throw error; }
  return async () => { await handle.close(); await unlink(path); };
}

export async function runDaemon({ pass, signal, pollMs = 15_000, report = () => {}, wait = async (ms, signal) => { try { await setTimeout(ms, undefined, { signal }); } catch (error) { if (!signal.aborted) throw error; } } }: {
  pass: () => Promise<void>; signal: AbortSignal; pollMs?: number;
  report?: (state: 'observed' | 'retrying') => void; wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  if (!Number.isSafeInteger(pollMs) || pollMs < 5_000 || pollMs > 60_000) throw new Error('Poll interval must be 5000..60000ms');
  let failures = 0;
  while (!signal.aborted) {
    try { await pass(); failures = 0; report('observed'); }
    catch { failures = Math.min(failures + 1, 5); report('retrying'); }
    if (!signal.aborted) await wait(Math.min(60_000, pollMs * 2 ** failures), signal);
  }
}
