// Explicit unattended admission is separate from desktop task/permission discovery.
import { z } from 'zod';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync, spawnSync } from 'node:child_process';
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
function assertWorkerInputs(prompt, admissionId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(admissionId)) throw new Error('Invalid admission UUID');
  if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > 1024 * 1024)
    throw new Error('Prompt must contain 1 to 1048576 bytes');
}
async function workerStateRoot(config) {
  const root = join(home(), 'unattended');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(root);
  if (inside(config.cwd, canonicalRoot)) throw new Error('Worker state must be outside its workspace');
  const stateInfo = await stat(canonicalRoot);
  if ((stateInfo.mode & 0o077) || stateInfo.uid !== process.getuid()) throw new Error('Worker state must be owner-only');
  return root;
}
// The caller persists this ID before invocation. Exclusive reservation is never
// reclaimed: retrying that operation reads evidence instead of launching again.
async function existingAdmission(directory, admissionId, binding) {
  try {
    await mkdir(directory, { mode: 0o700 });
    return null;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await workerResult(admissionId);
    if (JSON.stringify(existing.binding) !== JSON.stringify(binding))
      throw new Error('Admission ID belongs to a different job binding');
    return existing;
  }
}
async function continuationSession(resume, binding) {
  if (!/^[0-9a-f-]{36}$/.test(resume)) throw new Error('Invalid continuation admission ID');
  const previous = await workerResult(resume);
  if (!previous || JSON.stringify(previous.binding) !== JSON.stringify(binding) || !previous.terminationVerified || !previous.sessionId)
    throw new Error('Continuation requires a terminated session with the same job, checkout and gateway binding');
  return previous.sessionId;
}
// This branch always resolves the named gateway key. No native authentication path.
async function gatewayEnv(config, root, binding, step) {
  step.summary = 'Gateway credential resolution failed; no fallback';
  let { env } = await checkCodex(config.cwd, undefined, config.gateway);
  if (!env.OPENAI_API_KEY?.trim()) throw new Error('Gateway credential is empty; no fallback');
  step.summary = 'Worker preparation failed; no launch.';
  const providerKey = env.OPENAI_API_KEY;
  env = withoutReferencedSecrets(env, { gateways: [config.gateway] });
  const isolated = {};
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL'])
    if (env[name]) isolated[name] = env[name];
  isolated.OPENAI_API_KEY = providerKey;
  isolated.FACTORY_DELEGATED = '1';
  isolated.CODEX_HOME = join(root, 'sessions', key(JSON.stringify(binding)));
  await mkdir(isolated.CODEX_HOME, { recursive: true, mode: 0o700 });
  return isolated;
}
function workerArgv(config, sessionId) {
  const permission = codexPermission({ 'read-only': 'plan', 'workspace-write': 'acceptEdits', 'danger-full-access': 'bypassPermissions' }[config.sandbox]);
  return codexArgs(sessionId, config, permission, config.gateway, config.cwd);
}
// Every step before the guardian spawn; `step.summary` names the phase a failure is reported as.
async function prepareJob({ config, prompt, resume, admissionId, root, directory, binding, record }, step) {
  let sessionId = null;
  if (resume) {
    step.summary = 'Continuation requires a terminated session with the same job, checkout and gateway binding';
    sessionId = await continuationSession(resume, binding);
  }
  const isolated = await gatewayEnv(config, root, binding, step);
  const argv = workerArgv(config, sessionId);
  record.sessionId = sessionId;
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
  return isolated;
}
// Runs the guardian to its end; true only when python3 itself could not be spawned.
async function runGuardian(directory, isolated, signal) {
  const child = spawn('python3', [fileURLToPath(new URL('./guardian.py', import.meta.url)), join(directory, 'job.json')], { env: isolated, detached: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let spawned = false;
  child.once('spawn', () => { spawned = true; });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const heartbeat = setInterval(() => { if (!child.stdin.destroyed) child.stdin.write('{"type":"heartbeat"}\n'); }, 250);
  const cancel = () => { if (!child.stdin.destroyed) child.stdin.write('{"type":"stop"}\n'); };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  try { await once(child, 'close'); } catch (error) {
    if (!spawned && child.pid === undefined && error.code === 'ENOENT' && error.syscall === 'spawn python3') return true;
    // Other errors do not prove that no process started. Preserve the unknown hold.
  }
  finally { signal?.removeEventListener('abort', cancel); clearInterval(heartbeat); child.stdin.destroy(); process.off('SIGTERM', cancel); process.off('SIGINT', cancel); }
  return false;
}
export async function gatewayWorker(configPath, prompt, resume = null, admissionId = randomUUID(), signal, checkout) {
  assertWorkerInputs(prompt, admissionId);
  const config = await readWorkerConfig(configPath);
  if (checkout !== undefined) {
    const cwd = await realpath(checkout);
    if (dirname(cwd) !== config.cwd) throw new Error('Checkout must be a direct child of the enrolled workspace root');
    config.cwd = cwd;
  }
  const root = await workerStateRoot(config);
  const binding = { jobId: config.jobId, cwd: config.cwd, gateway: config.gateway, model: config.model, effort: config.effort, sandbox: config.sandbox, approvalPolicy: config.approvalPolicy };
  const directory = join(root, admissionId);
  const existing = await existingAdmission(directory, admissionId, binding);
  if (existing) return existing;
  const record = { admissionId, binding, sessionId: null, state: 'admitted', resultPath: join(directory, 'result.json') };
  await atomic(join(directory, 'admission.json'), record);
  const neverLaunched = async (phase, summary) => {
    record.sessionId = null;
    record.prelaunchFailure = { phase, proof: 'never-launched', summary };
    await atomic(join(directory, 'admission.json'), record);
    return workerResult(admissionId);
  };
  const step = { summary: 'Worker preparation failed; no launch.' };
  let isolated;
  try {
    isolated = await prepareJob({ config, prompt, resume, admissionId, root, directory, binding, record }, step);
  } catch {
    // No guardian spawn has been attempted. Never persist raw resolver/OS errors.
    return neverLaunched('preparation', step.summary);
  }
  if (signal?.aborted) return neverLaunched('preparation', 'Worker canceled before guardian launch.');
  if (await runGuardian(directory, isolated, signal))
    return neverLaunched('guardian-spawn', 'Guardian executable unavailable; no launch.');
  return workerResult(admissionId);
}
const terminationProof = fileURLToPath(new URL('./termination_proof.py', import.meta.url));
// The guardian's admission gate uses the same Python check, so status and resume agree.
const proofValid = (directory, admissionId) =>
  spawnSync('python3', [terminationProof, 'valid', directory, admissionId], { stdio: 'ignore', timeout: 10000 }).status === 0;
// Explicit late proof for an exited admission whose guardian could not verify cleanup at exit:
// a fresh read-only owned-process census, never a signal, never a launch. Status stays read-only.
export async function reconcileWorker(admissionId) {
  if (!/^[0-9a-f-]{36}$/.test(admissionId)) throw new Error('Invalid admission ID');
  const directory = join(home(), 'unattended', admissionId);
  const record = await readJSON(join(directory, 'admission.json'), null);
  if (!record || record.admissionId !== admissionId) throw new Error('Unknown admission ID');
  const run = spawnSync('python3', [terminationProof, 'reconcile', directory, admissionId], { encoding: 'utf8', timeout: 30000 });
  let reconciliation;
  try { reconciliation = JSON.parse(run.stdout); } catch { reconciliation = { proven: false, reason: 'Reconciliation produced no readable result' }; }
  return { ...(await workerResult(admissionId)), reconciliation };
}
// Reconstruct checkpoints from guardian-owned evidence after the service process dies.
// Reading status never relaunches a model or clears a workspace admission.
function prelaunchFailed(record, state) {
  const failure = record.prelaunchFailure;
  return !state && failure?.proof === 'never-launched' && ['preparation', 'guardian-spawn'].includes(failure.phase)
    && typeof failure.summary === 'string' && failure.summary && record.sessionId === null;
}
async function foldWorkerEvents(directory, record) {
  const run = { sequence: 0, newSession: record.sessionId };
  const events = await readFile(join(directory, 'events.jsonl'), 'utf8').catch(() => '');
  for (const line of events.split('\n')) {
    if (!line.trim()) continue;
    try { applyCodexEvent(run, JSON.parse(line)); } catch { /* Incomplete bounded event is checkpoint evidence. */ }
  }
  return run;
}
function workerTermination(state, directory, admissionId) {
  const reconciled = state?.runId === admissionId && state?.state === 'exited' && state?.cleanupVerified === false
    && !state.admissionRejected && proofValid(directory, admissionId);
  const terminationVerified = state?.runId === admissionId && state?.state === 'exited' && (state?.cleanupVerified === true || reconciled);
  return { reconciled, terminationVerified };
}
function workerOutcome(state, terminationVerified, run) {
  if (state?.admissionRejected)
    return { outcome: 'needs_input', summary: state.reason, evidence: [], question: 'Reconcile the existing workspace admission before retrying.' };
  if (!terminationVerified)
    return { outcome: 'needs_input', summary: 'Worker termination is unverified; workspace admission remains held.', evidence: [], question: 'Reconcile the exact guardian and worker group before retrying.' };
  if (state.interrupted)
    return { outcome: 'needs_input', summary: state.reason || 'Bounded invocation stopped; resume the retained session.', evidence: [], question: '' };
  if (state.exitCode !== 0 || !run.result)
    return { outcome: 'failed', summary: run.error || 'Gateway worker exited without a successful structured turn; no fallback.', evidence: [], question: '' };
  return run.result;
}
const isoMillis = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
function runnerTiming(timing, admissionId, reconciled) {
  if (!Number.isSafeInteger(timing?.durationMs) || timing.durationMs <= 0 || ![timing.startedAt, timing.endedAt].every(isoMillis)) return null;
  return { source: 'runner', startedAt: timing.startedAt, endedAt: timing.endedAt, durationMs: timing.durationMs,
    evidence: `Guardian process.json for admission ${admissionId}; monotonic duration includes owned cleanup.`
      + (reconciled ? ' Cleanup was proven later by a fresh owned-process census (reconciliation.json).' : '') };
}
export async function workerResult(admissionId) {
  if (!/^[0-9a-f-]{36}$/.test(admissionId)) throw new Error('Invalid admission ID');
  const directory = join(home(), 'unattended', admissionId);
  const record = await readJSON(join(directory, 'admission.json'), null);
  if (!record || record.admissionId !== admissionId) throw new Error('Unknown admission ID');
  const state = await readJSON(join(directory, 'process.json'), null);
  if (prelaunchFailed(record, state)) {
    const result = { outcome: 'failed', summary: record.prelaunchFailure.summary, evidence: [], question: '' };
    const output = { ...record, state: 'failed', terminationVerified: true, exitCode: null, result };
    await atomic(join(directory, 'result.json'), output);
    return output;
  }
  const run = await foldWorkerEvents(directory, record);
  const { reconciled, terminationVerified } = workerTermination(state, directory, admissionId);
  const result = workerOutcome(state, terminationVerified, run);
  const output = { ...record, sessionId: run.newSession || null, state: result.outcome, terminationVerified, exitCode: state?.exitCode ?? null, result };
  const timing = terminationVerified && output.sessionId ? runnerTiming(state?.timing, admissionId, reconciled) : null;
  if (timing) output.timing = timing;
  if (terminationVerified || state?.admissionRejected) await atomic(join(directory, 'result.json'), output);
  return output;
}
