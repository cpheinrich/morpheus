// Explicit unattended admission is separate from desktop task/permission discovery.
import { z } from 'zod';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { home, modelIdPattern, MOVING_MODEL_ALIASES, secretRef, codexPermission, withoutReferencedSecrets } from './config.mjs';
import { checkCodex, codexArgs, codexHandoff, applyCodexEvent } from './codex-exec.mjs';
import { atomic, readJSON, key } from './store.mjs';

const schema = z.strictObject({
  version: z.literal(1),
  jobId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  cwd: z.string().refine(isAbsolute),
  gateway: z.strictObject({
    name: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    provider: z.literal('codex'),
    baseUrl: z.string().url(),
    keyRef: secretRef,
  }),
  model: z.string().regex(modelIdPattern).refine(v => !MOVING_MODEL_ALIASES.has(v.toLowerCase())),
  effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']),
  sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']),
  approvalPolicy: z.literal('never'),
  maxRunSeconds: z.number().int().min(1).max(28800),
  maxLogBytes: z.number().int().min(256).max(16 * 1024 * 1024),
});
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
async function privateFile(path) {
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077) || info.uid !== process.getuid())
    throw new Error('Configuration must be an owner-only regular file');
}
export async function readWorkerConfig(path) {
  const configPath = await realpath(path);
  await privateFile(configPath);
  let config;
  try { config = schema.parse(JSON.parse(await readFile(configPath, 'utf8'))); }
  catch { throw new Error('Invalid unattended worker configuration'); }
  config.cwd = await realpath(config.cwd);
  // A service authority file cannot be part of an agent-editable checkout.
  let workspaceRoot;
  try { workspaceRoot = await realpath(execFileSync('git', ['-C', dirname(configPath), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  if (workspaceRoot || inside(config.cwd, configPath)) throw new Error('Configuration must be outside workspaces');
  const url = new URL(config.gateway.baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /["\\\s]/.test(config.gateway.baseUrl))
    throw new Error('Gateway URL must be an explicit credential-free HTTP(S) endpoint');
  config.gateway.baseUrl = config.gateway.baseUrl.replace(/\/+$/, '');
  return config;
}
export async function gatewayWorker(configPath, prompt, resume = null) {
  if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > 1024 * 1024)
    throw new Error('Prompt must contain 1 to 1048576 bytes');
  const config = await readWorkerConfig(configPath);
  const root = join(home(), 'unattended');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(root);
  if (inside(config.cwd, canonicalRoot)) throw new Error('Worker state must be outside its workspace');
  const stateInfo = await stat(canonicalRoot);
  if ((stateInfo.mode & 0o077) || stateInfo.uid !== process.getuid()) throw new Error('Worker state must be owner-only');
  const binding = { jobId: config.jobId, cwd: config.cwd, gateway: config.gateway, model: config.model, effort: config.effort, sandbox: config.sandbox, approvalPolicy: config.approvalPolicy };
  let sessionId = null;
  if (resume) {
    if (!/^[0-9a-f-]{36}$/.test(resume)) throw new Error('Invalid continuation admission ID');
    const previous = await workerResult(resume);
    if (!previous || JSON.stringify(previous.binding) !== JSON.stringify(binding) || !previous.terminationVerified || !previous.sessionId)
      throw new Error('Continuation requires a terminated session with the same job, checkout and gateway binding');
    sessionId = previous.sessionId;
  }
  // This branch always resolves the named gateway key. No native authentication path.
  let env;
  try { ({ env } = await checkCodex(config.cwd, undefined, config.gateway)); }
  catch { throw new Error('Gateway credential resolution failed; no fallback'); }
  if (!env.OPENAI_API_KEY?.trim()) throw new Error('Gateway credential is empty; no fallback');
  env = withoutReferencedSecrets(env, { gateways: [config.gateway] });
  const isolated = {};
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL'])
    if (env[name]) isolated[name] = env[name];
  isolated.OPENAI_API_KEY = env.OPENAI_API_KEY;
  isolated.FACTORY_DELEGATED = '1';
  isolated.CODEX_HOME = join(root, 'sessions', key(JSON.stringify(binding)));
  await mkdir(isolated.CODEX_HOME, { recursive: true, mode: 0o700 });
  const permission = codexPermission({ 'read-only': 'plan', 'workspace-write': 'acceptEdits', 'danger-full-access': 'bypassPermissions' }[config.sandbox]);
  const argv = codexArgs(sessionId, config, permission, config.gateway);
  // Pin the provider even if a host or project has a different default provider.
  argv.splice(argv.length - (sessionId ? 2 : 1), 0,
    '-c', 'model_provider="OpenAI"',
    '-c', 'model_providers.OpenAI.env_key="OPENAI_API_KEY"',
    '-c', 'model_providers.OpenAI.requires_openai_auth=false');
  const admissionId = randomUUID();
  const directory = join(root, admissionId);
  await mkdir(directory, { mode: 0o700 });
  const record = { admissionId, binding, sessionId, state: 'admitted', resultPath: join(directory, 'result.json') };
  await atomic(join(directory, 'admission.json'), record);
  const job = {
    runId: admissionId, cwd: config.cwd, argv,
    prompt: await codexHandoff(prompt, [], 'the unattended service'), input: 'text',
    maxRunSeconds: config.maxRunSeconds, maxLogBytes: config.maxLogBytes,
    graceSeconds: 2, background: false,
    admission: { directory: root, workspaceKey: key(config.cwd) },
    redactEnv: ['OPENAI_API_KEY'],
  };
  await atomic(join(directory, 'job.json'), job);
  const child = spawn('python3', [fileURLToPath(new URL('./guardian.py', import.meta.url)), join(directory, 'job.json')], { env: isolated, detached: true, stdio: ['pipe', 'ignore', 'pipe'] });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const heartbeat = setInterval(() => { if (!child.stdin.destroyed) child.stdin.write('{"type":"heartbeat"}\n'); }, 250);
  const cancel = () => { if (!child.stdin.destroyed) child.stdin.write('{"type":"stop"}\n'); };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  try { await once(child, 'close'); } catch { /* Preserve admission and report unknown termination. */ }
  finally { clearInterval(heartbeat); child.stdin.destroy(); process.off('SIGTERM', cancel); process.off('SIGINT', cancel); }
  return workerResult(admissionId);
}
// Reconstruct checkpoints from guardian-owned evidence after the service process dies.
// Reading status never relaunches a model or clears a workspace admission.
export async function workerResult(admissionId) {
  if (!/^[0-9a-f-]{36}$/.test(admissionId)) throw new Error('Invalid admission ID');
  const directory = join(home(), 'unattended', admissionId);
  const record = await readJSON(join(directory, 'admission.json'), null);
  if (!record || record.admissionId !== admissionId) throw new Error('Unknown admission ID');
  const state = await readJSON(join(directory, 'process.json'), null);
  const run = { sequence: 0, newSession: record.sessionId };
  const events = await readFile(join(directory, 'events.jsonl'), 'utf8').catch(() => '');
  for (const line of events.split('\n')) {
    if (!line.trim()) continue;
    try { applyCodexEvent(run, JSON.parse(line)); } catch { /* Incomplete bounded event is checkpoint evidence. */ }
  }
  const terminationVerified = state?.runId === admissionId && state?.state === 'exited' && state?.cleanupVerified === true;
  const result = state?.admissionRejected
    ? { outcome: 'needs_input', summary: state.reason, evidence: [], question: 'Reconcile the existing workspace admission before retrying.' }
    : !terminationVerified
      ? { outcome: 'needs_input', summary: 'Worker termination is unverified; workspace admission remains held.', evidence: [], question: 'Reconcile the exact guardian and worker group before retrying.' }
      : state.interrupted
        ? { outcome: 'needs_input', summary: state.reason || 'Bounded invocation stopped; resume the retained session.', evidence: [], question: '' }
        : state.exitCode !== 0 || !run.result
          ? { outcome: 'failed', summary: run.error || 'Gateway worker exited without a successful structured turn; no fallback.', evidence: [], question: '' }
          : run.result;
  const output = { ...record, sessionId: run.newSession || null, state: result.outcome, terminationVerified, exitCode: state?.exitCode ?? null, result };
  if (terminationVerified || state?.admissionRejected) await atomic(join(directory, 'result.json'), output);
  return output;
}
