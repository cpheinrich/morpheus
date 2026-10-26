import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, lstat, realpath, unlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Command } from './protocol.js';
import { boundedJson, digest, id } from './protocol.js';

type BackendCall = (method: 'pending' | 'claim' | 'beginApply' | 'complete' | 'inspect', data?: any) => Promise<any>;
type BridgeCall = (method: string, data: Record<string, unknown>) => Promise<any>;
type Journal = { version: 1; operationId: string; requestHash: string; fence: string; state: 'prepared' | 'applying' | 'receipt' | 'unknown' | 'acked'; result?: unknown };

// UUID text is accepted case-sensitively by Firestore. A digest filename also
// preserves distinct spellings on case-insensitive Mac filesystems.
export const journalName = (operationId: string) => `${digest(id.parse(operationId))}.json`;

// Run one bounded pass from a caller-owned loop/LaunchAgent. No scheduler or model selection.
export function createConnector({ directory, companyId, controllerId, connectorId, backend, bridge }: {
  directory: string; companyId: string; controllerId: string; connectorId: string; backend: BackendCall; bridge: BridgeCall;
}) {
  let dir = resolve(directory);
  let busy = false;
  async function initialize() {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await lstat(dir)).isSymbolicLink()) throw new Error('Connector journal symlink refused');
    dir = await realpath(dir);
    const stat = await lstat(dir);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('Connector journal must be private and owned');
  }
  const file = (operationId: string) => join(dir, journalName(operationId));
  async function read(id: string): Promise<Journal | null> {
    try {
      if ((await lstat(file(id))).isSymbolicLink()) throw new Error('Connector journal symlink refused');
      const handle = await open(file(id), 'r');
      try { return JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
    } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function write(journal: Journal) {
    const temp = `${file(journal.operationId)}.${randomUUID()}.tmp`;
    const h = await open(temp, 'wx', 0o600);
    try { await h.writeFile(JSON.stringify(journal)); await h.sync(); } finally { await h.close(); }
    await rename(temp, file(journal.operationId));
  }
  async function ack(journal: Journal) {
    await backend('complete', { operationId: journal.operationId, fence: journal.fence,
      ...(journal.state === 'unknown' ? { unknown: true } : { result: journal.result }) });
    await write({ ...journal, state: 'acked' });
  }
  async function apply(operationId: string) {
    const existing = await read(operationId);
    if (existing && existing.state !== 'prepared') {
      if (existing.state === 'receipt' || existing.state === 'unknown') await ack(existing);
      // An interrupted local apply is never replayed, even if no response was saved.
      else if (existing.state === 'applying') await ack({ ...existing, state: 'unknown' });
      return;
    }
    let prepared: Command | null = null;
    if (existing) {
      const observed = await backend('inspect', { operationId }) as Command;
      if (observed.requestHash !== existing.requestHash) throw new Error('Connector journal binding changed');
      if (observed.state === 'completed' || observed.state === 'rejected' || observed.state === 'unknown') {
        await write({ ...existing, state: 'acked' }); return;
      }
      if (observed.state === 'applying') { await ack({ ...existing, state: 'unknown' }); return; }
      // prepared is durable proof that no local bridge invocation began. The
      // server will fence a stale claim; its fresh actor check still runs below.
      prepared = await backend('claim', { operationId }) as Command | null;
      if (!prepared && observed.state === 'claimed' && observed.fence === existing.fence) prepared = observed;
    }
    const command = prepared ?? await backend('claim', { operationId }) as Command | null;
    if (!command) return;
    if (command.companyId !== companyId || command.controllerId !== controllerId || command.operationId !== operationId || command.state !== 'claimed' || !command.fence ||
        command.request.operationId !== operationId || command.request.companyId !== companyId ||
        command.requestHash !== digest({ request: command.request, actorUid: command.actor.uid })) throw new Error('Connector received a foreign or corrupt command');
    let journal: Journal = { version: 1, operationId, requestHash: command.requestHash, fence: command.fence, state: 'prepared' };
    await write(journal);
    await backend('beginApply', { operationId, fence: command.fence });
    journal = { ...journal, state: 'applying' }; await write(journal);
    try {
      const result = boundedJson(await bridge(`hq.${command.request.action}`, {
        ...command.request.args, connectorId, companyId, actor: command.actor, operationId,
      }));
      journal = { ...journal, state: 'receipt', result }; await write(journal);
    } catch {
      // Even a transport exception may follow an accepted Paperclip mutation.
      journal = { ...journal, state: 'unknown' }; await write(journal);
    }
    await ack(journal);
  }
  return {
    async tick(signal?: AbortSignal) {
      if (busy) throw new Error('Connector pass already active');
      busy = true;
      try {
        await initialize();
        // Exclusive local owner: never steal an abandoned lock on PID alone. A crash
        // leaves it for explicit ownership inspection; cloud applying state also fences.
        const lockPath = join(dir, 'connector.lock');
        const lock = await open(lockPath, 'wx', 0o600);
        try {
          await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
          for (const name of await readdir(dir)) {
            if (signal?.aborted) break;
            if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
            if ((await lstat(join(dir, name))).isSymbolicLink()) throw new Error('Connector journal symlink refused');
            const saved = JSON.parse(await readFile(join(dir, name), 'utf8')) as Journal;
            if (journalName(saved.operationId) !== name) throw new Error('Connector journal filename binding changed');
            const journal = await read(saved.operationId);
            if (journal && ['prepared', 'receipt', 'applying', 'unknown'].includes(journal.state)) await apply(journal.operationId);
          }
          if (signal?.aborted) return { observed: 0 };
          const pending = await backend('pending');
          if (!Array.isArray(pending) || pending.length > 25 || pending.some(operationId => !id.safeParse(operationId).success)) throw new Error('Invalid pending command list');
          for (const operationId of pending) { if (signal?.aborted) break; await apply(operationId); }
          return { observed: pending.length };
        } finally { await lock.close(); await unlink(lockPath); }
      } finally { busy = false; }
    },
  };
}
