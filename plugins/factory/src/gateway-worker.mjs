// Explicit unattended admission is separate from desktop task/permission discovery.
import { z } from 'zod';
import { constants } from 'node:fs';
import { link, mkdir, open, readFile, realpath, rm, stat } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { homedir } from 'node:os';
import { home, modelIdPattern, MOVING_MODEL_ALIASES, secretRef, codexPermission, withoutReferencedSecrets } from './config.mjs';
import { checkCodex, codexArgs, codexHandoff, applyCodexEvent } from './codex-exec.mjs';
import { checkClaude, claudeArgs, applyClaudeEvent } from './claude.mjs';
import { claudeOverage } from './fleet-claude.mjs';
import { atomic, readJSON, key } from './store.mjs';
import { materializeInputs, privateInputPrompt, removeInputs } from './fleet-input-files.mjs';

import { workspaceHost, enrolledWorkspace, singleProjectCredentials, credentialEnrollment, checkoutSingleProjectCredentials, operatorControls } from './fleet-workspace-checkout.mjs';

const gatewaySchema = provider => z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  provider: z.literal(provider),
  baseUrl: z.string().url(),
  keyRef: secretRef,
});
const fixedModel = z.string().regex(modelIdPattern).refine(v => !MOVING_MODEL_ALIASES.has(v.toLowerCase()));
const schema = z.strictObject({
  version: z.literal(1),
  jobId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  cwd: z.string().refine(isAbsolute),
  gateway: gatewaySchema('codex'),
  model: fixedModel,
  effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']),
  sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']),
  approvalPolicy: z.literal('never'),
  fleetWorkspace: workspaceHost.optional(),
  fleetCredentials: singleProjectCredentials.optional(),
  fleetClaude: z.strictObject({ gateway: gatewaySchema('claude'), model: fixedModel }).optional(),
  maxRunSeconds: z.number().int().min(1).max(28800),
  maxLogBytes: z.number().int().min(256).max(16 * 1024 * 1024),
});
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
async function configAuthority(path) {
  const info = await stat(path);
  if (info.isFile() && info.uid === process.getuid() && !(info.mode & 0o077)) return 'worker';
  if (info.isFile() && info.uid === 0 && !(info.mode & 0o037) && await operatorControls(path))
    return 'operator';
  throw new Error('Configuration must be an owner-only regular file or a protected operator file');
}
function normalizeGateway(gateway) {
  const url = new URL(gateway.baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /["\\\s]/.test(gateway.baseUrl))
    throw new Error('Gateway URL must be an explicit credential-free HTTP(S) endpoint');
  gateway.baseUrl = gateway.baseUrl.replace(/\/+$/, '');
}
export async function readWorkerConfig(path) {
  const configPath = await realpath(path);
  const authority = await configAuthority(configPath);
  let config;
  try { config = schema.parse(JSON.parse(await readFile(configPath, 'utf8'))); }
  catch { throw new Error('Invalid unattended worker configuration'); }
  config.cwd = await realpath(config.cwd);
  if (config.fleetWorkspace && authority !== 'operator') throw new Error('Workspace policy requires protected operator configuration');
  if (config.fleetCredentials && (authority !== 'operator' || path !== configPath || config.fleetWorkspace))
    throw new Error('Single-project credentials require canonical protected operator configuration without a workspace policy');
  if (config.fleetClaude && authority !== 'operator') throw new Error('Fleet Claude requires protected operator configuration');
  // A service authority file cannot be part of an agent-editable checkout.
  let workspaceRoot;
  try { workspaceRoot = await realpath(execFileSync('git', ['-C', dirname(configPath), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  if (workspaceRoot || inside(config.cwd, configPath)) throw new Error('Configuration must be outside workspaces');
  normalizeGateway(config.gateway);
  if (config.fleetClaude) normalizeGateway(config.fleetClaude.gateway);
  return Object.assign(config, { authority });
}
export function fleetWorkerRoute(config, selection) {
  const route = selection?.provider === 'codex' ? config : config.fleetClaude;
  if (!route || selection?.provider !== route.gateway.provider || selection.gateway !== route.gateway.name || selection.model !== route.model)
    throw new Error('Fleet selection does not match an enrolled worker route');
  if (selection.provider === 'claude' && ((selection.speed !== undefined && selection.speed !== 'standard') || config.effort === 'none'))
    throw new Error('Fleet Claude requires Standard speed and a supported effort');
  return { gateway: route.gateway, model: route.model };
}
export async function enrolledSandbox(config, source) {
  const { sandbox, authority } = config;
  if (sandbox === 'workspace-write') return true;
  if (sandbox !== 'danger-full-access' || authority !== 'operator' || source?.checkout !== 'git' || process.getuid() === 0)
    return false;
  const info = await stat(homedir());
  return info.isDirectory() && info.uid === process.getuid() && !(info.mode & 0o077);
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
function legacyBinding(binding) {
  const legacy = { ...binding };
  delete legacy.fleet;
  return legacy;
}
async function continuationSession(resume, binding) {
  if (!/^[0-9a-f-]{36}$/.test(resume)) throw new Error('Invalid continuation admission ID');
  const previous = await workerResult(resume);
  // An upgrade may resume a pre-receipt admission with the checkout's old binding.
  const upgrading = binding.gateway.provider === 'codex' && binding.fleet && !binding.fleet.credentialEnrollment && !previous.binding?.fleet;
  const expected = upgrading ? legacyBinding(binding) : binding;
  if (JSON.stringify(previous.binding) !== JSON.stringify(expected) || !previous.terminationVerified || !previous.sessionId)
    throw new Error('Continuation requires a terminated session with the same job, checkout and gateway binding');
  return { sessionId: previous.sessionId, legacySessionHome: !!(upgrading || previous.legacySessionHome === true) };
}
// This branch always resolves the named gateway key. No native authentication path.
async function gatewayEnv(config, root, binding, step) {
  step.summary = 'Gateway credential resolution failed; no fallback';
  const claude = config.gateway.provider === 'claude';
  const keyName = claude ? 'ANTHROPIC_AUTH_TOKEN' : 'OPENAI_API_KEY';
  const checkProvider = claude ? checkClaude : checkCodex;
  let { env } = await checkProvider(config.cwd, undefined, config.gateway);
  if (!env[keyName]?.trim()) throw new Error('Gateway credential is empty; no fallback');
  step.summary = 'Worker preparation failed; no launch.';
  const providerKey = env[keyName];
  env = withoutReferencedSecrets(env, { gateways: [config.gateway] });
  const isolated = {};
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL'])
    if (env[name]) isolated[name] = env[name];
  isolated[keyName] = providerKey;
  isolated.FACTORY_DELEGATED = '1';
  const sessionKey = key(JSON.stringify(binding));
  const sessionHome = join(root, 'sessions', sessionKey);
  await mkdir(sessionHome, { recursive: true, mode: 0o700 });
  if (claude) {
    const directory = await realpath(sessionHome);
    const info = await stat(directory);
    if (directory !== join(await realpath(root), 'sessions', sessionKey) || !info.isDirectory() ||
        info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Claude session home must be private and unredirected');
    Object.assign(isolated, {
      CLAUDE_CONFIG_DIR: directory, ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_FAST_MODE: '1',
    });
  } else isolated.CODEX_HOME = sessionHome;
  return isolated;
}
function workerArgv(config, sessionId) {
  if (config.gateway.provider === 'claude') {
    const addDirs = (config.writableRoots ?? []).filter(path => path !== config.cwd);
    const argv = claudeArgs(sessionId, { ...config, speed: 'standard' }, 'bypassPermissions', addDirs, config.cwd);
    const roots = config.sandbox === 'workspace-write' ? [config.cwd, ...addDirs] : null;
    return [process.execPath, fileURLToPath(new URL('./fleet-claude.mjs', import.meta.url)), String(config.maxLogBytes),
      JSON.stringify(roots), ...argv, '--setting-sources', '', '--strict-mcp-config'];
  }
  const permission = codexPermission({ 'read-only': 'plan', 'workspace-write': 'acceptEdits', 'danger-full-access': 'bypassPermissions' }[config.sandbox]);
  return codexArgs(sessionId, config, permission, config.gateway, config.cwd);
}
async function enrolledCredentials(config, fleet, resume) {
  if (credentialEnrollment(config) !== fleet?.credentialEnrollment)
    throw new Error('Credential enrollment changed before invocation');
  if (!config.fleetCredentials) return false;
  if (!z.uuid().safeParse(fleet.taskId).success || !z.uuid().safeParse(fleet.attemptId).success ||
      config.cwd !== join(dirname(config.cwd), fleet.attemptId) || !await enrolledSandbox(config, fleet.source))
    throw new Error('Credential enrollment requires a matching Fleet Git attempt');
  await checkoutSingleProjectCredentials(config.cwd, fleet.source, config.fleetCredentials, resume);
  return true;
}

// Every step before the guardian spawn; `step.summary` names the phase a failure is reported as.
async function prepareJob({ config, prompt, resume, admissionId, root, directory, binding, record, inputs }, step) {
  let sessionId = null;
  let sessionBinding = binding;
  if (resume) {
    step.summary = 'Continuation requires a terminated session with the same job, checkout and gateway binding';
    const continuation = await continuationSession(resume, binding);
    sessionId = continuation.sessionId;
    if (continuation.legacySessionHome) {
      // Codex reads the retained thread from the same home on every later resume.
      sessionBinding = legacyBinding(binding);
      record.legacySessionHome = true;
    }
  }
  step.summary = 'Studio credential enrollment or checkout verification failed; no launch.';
  if (await enrolledCredentials(config, binding.fleet, Boolean(resume)))
    prompt += '\n\nUse the enrolled local companion only as needed for this project. Use `morpheus credentials list`, `morpheus credentials doctor`, or `morpheus credentials run -- <trusted-command>`. Never read secret files or print, copy, or record credential values.';
  const isolated = await gatewayEnv(config, root, sessionBinding, step);
  const argv = workerArgv(config, sessionId);
  const claude = config.gateway.provider === 'claude';
  if (inputs) {
    const paths = await materializeInputs(root, binding.fleet.attemptId, inputs.manifest, inputs.bytes, resume);
    prompt += privateInputPrompt(config.gateway.provider, paths);
  }
  record.sessionId = sessionId;
  await atomic(join(directory, 'admission.json'), record);
  const job = {
    runId: admissionId, cwd: config.cwd, argv,
    prompt: await codexHandoff(prompt, [], 'the unattended service'), input: claude ? 'stream-json' : 'text',
    maxRunSeconds: config.maxRunSeconds, maxLogBytes: config.maxLogBytes,
    graceSeconds: 2, background: false,
    admission: { directory: root, workspaceKey: key(config.cwd) },
    redactEnv: [claude ? 'ANTHROPIC_AUTH_TOKEN' : 'OPENAI_API_KEY'],
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
async function bindCheckout(config, checkout, fleet) {
  if (config.fleetWorkspace && (!checkout || !fleet?.workspace)) throw new Error('Workspace binding required');
  if (checkout !== undefined) {
    const cwd = await realpath(checkout);
    if (fleet?.workspace) {
      const { workspace } = enrolledWorkspace(config.fleetWorkspace, fleet.workspace, config.sandbox);
      z.uuid().parse(fleet.attemptId);
      const base = join(config.cwd, fleet.attemptId);
      if (cwd !== join(base, workspace.primary)) throw new Error('Checkout differs from enrolled workspace');
      config.writableRoots = [];
      for (const repo of workspace.repositories) {
        const path = join(base, repo.project);
        if (await realpath(path) !== path) throw new Error('Workspace checkout was redirected');
        config.writableRoots.push(path);
      }
    } else if (config.fleetWorkspace || dirname(cwd) !== config.cwd) throw new Error('Checkout must be a direct child of the enrolled workspace root');
    config.cwd = cwd;
  }
}
async function admittedWorkerConfig(configPath, checkout, fleet, selection) {
  const config = await readWorkerConfig(configPath);
  if (selection !== undefined) Object.assign(config, fleetWorkerRoute(config, selection));
  const claude = config.gateway.provider === 'claude';
  if (claude && (!checkout || !z.uuid().safeParse(fleet?.taskId).success || !z.uuid().safeParse(fleet?.attemptId).success ||
      fleet.gatewayBaseUrl !== config.gateway.baseUrl || fleet.source?.checkout !== 'git' || !await enrolledSandbox(config, fleet.source)))
    throw new Error('Fleet Claude requires a matching Git enrollment and a supported worker sandbox');
  await bindCheckout(config, checkout, fleet);
  if (claude && !fleet.workspace && config.cwd !== join(dirname(config.cwd), fleet.attemptId))
    throw new Error('Checkout differs from the enrolled Fleet attempt');
  return config;
}
export async function gatewayWorker(configPath, prompt, resume = null, admissionId = randomUUID(), signal, checkout, fleet, selection, inputs) {
  assertWorkerInputs(prompt, admissionId);
  const config = await admittedWorkerConfig(configPath, checkout, fleet, selection);
  const claude = config.gateway.provider === 'claude';
  const root = await workerStateRoot(config);
  const binding = { jobId: config.jobId, cwd: config.cwd, gateway: config.gateway, model: config.model, effort: config.effort, sandbox: config.sandbox, approvalPolicy: config.approvalPolicy, ...(fleet ? { fleet } : {}), ...(config.writableRoots ? { writableRoots: config.writableRoots } : {}), ...(claude ? { authority: config.authority } : {}) };
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
    isolated = await prepareJob({ config, prompt, resume, admissionId, root, directory, binding, record, inputs }, step);
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
  let record;
  try { record = await readJSON(join(directory, 'admission.json'), null); }
  catch (error) {
    if (error.code === 'ENOTDIR') return readRetiredAdmission(directory, admissionId);
    throw error;
  }
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
const structuredClaude = z.strictObject({
  outcome: z.enum(['completed', 'needs_input', 'failed']),
  summary: z.string(), evidence: z.array(z.string()), question: z.string().optional(),
});
function foldClaudeEvent(run, event) {
  if (claudeOverage(event)) run.overage = true;
  if (event.type === 'system' && event.subtype === 'init') {
    if (!z.uuid().safeParse(event.session_id).success || (run.newSession && run.newSession !== event.session_id))
      run.invalidSession = true;
    else run.observedSession = run.newSession = event.session_id;
  } else if (event.session_id && run.newSession && event.session_id !== run.newSession) {
    run.invalidSession = true;
  }
  if (event.type !== 'result') return;
  const report = structuredClaude.safeParse(event.structured_output);
  if (event.is_error || !report.success) {
    run.result = null;
    return;
  }
  applyClaudeEvent(run, { ...event, structured_output: report.data });
}
async function foldWorkerEvents(directory, record) {
  const claude = record.binding?.gateway?.provider === 'claude';
  const run = { sequence: 0, newSession: record.sessionId, claude };
  const events = await readFile(join(directory, 'events.jsonl'), 'utf8').catch(() => '');
  for (const line of events.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (claude) { foldClaudeEvent(run, event); continue; }
      if (event.type === 'turn.started') run.startedTurn = true;
      if (event.type === 'thread.started' && event.thread_id) run.observedSession = event.thread_id;
      applyCodexEvent(run, event);
    } catch { /* Incomplete bounded event is checkpoint evidence. */ }
  }
  if (run.invalidSession) run.observedSession = run.newSession = null;
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
  if (run.overage || run.invalidSession)
    return { outcome: 'failed', summary: run.overage ? 'Claude reported paid overage; worker stopped without fallback.' : 'Claude session differs from the admitted session.', evidence: [], question: '' };
  if (state.interrupted)
    return { outcome: 'needs_input', summary: state.reason || 'Bounded invocation stopped; resume the retained session.', evidence: [], question: '' };
  if (state.exitCode !== 0 || !run.result || (run.claude && !run.observedSession))
    return { outcome: 'failed', summary: run.error || 'Gateway worker exited without a successful structured turn; no fallback.', evidence: [], question: '' };
  return run.result;
}
// The Codex CLI reports a turn/start rejection on stderr, before an inference turn exists.
// Read a bounded tail and expose only a recognized code, never the provider's data or message.
async function inputDiagnostic(directory) {
  const log = await open(join(directory, 'stderr.log'), 'r').catch(() => null);
  if (!log) return null;
  try {
    const { size } = await log.stat();
    const tail = Buffer.alloc(Math.min(size, 8192));
    const offset = size - tail.length;
    const { bytesRead } = await log.read(tail, 0, tail.length, offset);
    const text = tail.toString('utf8', 0, bytesRead);
    const lines = offset ? text.replace(/^[^\n]*(?:\n|$)/, '') : text;
    const rejection = /^Error: turn\/start: turn\/start failed: [^\r\n]* \(code -32602\), data: (\{[^\r\n]*\})\r?$/gm;
    for (const [, data] of lines.matchAll(rejection)) {
      try {
        if (JSON.parse(data)?.input_error_code === 'input_too_large') return 'input_too_large';
      } catch { /* Ignore truncated or malformed provider data. */ }
    }
  } catch { /* Older or unreadable logs keep the generic result. */ }
  finally { await log.close().catch(() => {}); }
  return null;
}
async function workerDiagnostic(directory, state, verified, run) {
  if (run.overage || run.invalidSession) return null;
  if (verified && state.interrupted && state.reason === 'Run deadline reached') return 'deadline_reached';
  if (run.claude || !verified || state.admissionRejected || state.interrupted || !Number.isInteger(state.exitCode)
      || state.exitCode === 0 || run.startedTurn || run.result) return null;
  return inputDiagnostic(directory);
}
const isoMillis = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
function runnerTiming(timing, admissionId, reconciled) {
  if (!Number.isSafeInteger(timing?.durationMs) || timing.durationMs <= 0 || ![timing.startedAt, timing.endedAt].every(isoMillis)) return null;
  return { source: 'runner', startedAt: timing.startedAt, endedAt: timing.endedAt, durationMs: timing.durationMs,
    evidence: `Guardian process.json for admission ${admissionId}; monotonic duration includes owned cleanup.`
      + (reconciled ? ' Cleanup was proven later by a fresh owned-process census (reconciliation.json).' : '') };
}
function workerLaunch(state, verified, run) {
  if (!verified) return 'unknown';
  if (state.admissionRejected || state.launchFailed) return 'never-launched';
  return run.observedSession ? 'session' : 'unknown';
}
// Recovery competes with launch in the existing admission namespace. The
// exclusive hard link publishes a complete retirement or leaves the existing
// reservation untouched. A late executor's mkdir cannot win after retirement.
async function retireAdmission(root, admissionId, fleet) {
  const reservation = join(root, admissionId);
  const staging = `${reservation}.${randomUUID()}.retiring`;
  const file = await open(staging, 'wx', 0o600);
  try {
    try {
      await file.writeFile(JSON.stringify({ kind: 'retired-prelaunch', admissionId, fleet }));
      await file.sync();
    } finally { await file.close(); }
    await link(staging, reservation).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const directory = await open(root, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(staging, { force: true }); }
}

export async function recoverWorkerAdmission(configPath, admissionId, fleet) {
  z.uuid().parse(admissionId);
  try { return await workerResult(admissionId); }
  catch (error) {
    if (!z.uuid().safeParse(fleet?.taskId).success || !z.uuid().safeParse(fleet?.attemptId).success) throw error;
  }
  await retireAdmission(await workerStateRoot(await readWorkerConfig(configPath)), admissionId, fleet);
  return workerResult(admissionId);
}

export async function cleanupWorkerInputs(configPath, admissionId, fleet) {
  const prior = await recoverWorkerAdmission(configPath, admissionId, fleet);
  const binding = prior.binding?.fleet;
  if (!prior.terminationVerified || binding?.taskId !== fleet.taskId || binding?.attemptId !== fleet.attemptId) return false;
  await removeInputs(await workerStateRoot(await readWorkerConfig(configPath)), fleet.attemptId);
  return true;
}

async function readRetiredAdmission(path, admissionId) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) || info.size > 64 * 1024)
      throw new Error('Unsafe retired admission');
    const record = JSON.parse(await file.readFile('utf8'));
    if (record.kind !== 'retired-prelaunch' || record.admissionId !== admissionId)
      throw new Error('Invalid retired admission');
    return { admissionId, binding: { fleet: record.fleet }, state: 'failed', sessionId: null,
      launch: 'never-launched', terminationVerified: true };
  } finally { await file.close(); }
}
export async function workerResult(admissionId) {
  if (!/^[0-9a-f-]{36}$/.test(admissionId)) throw new Error('Invalid admission ID');
  const directory = join(home(), 'unattended', admissionId);
  let record;
  try { record = await readJSON(join(directory, 'admission.json'), null); }
  catch (error) {
    if (error.code === 'ENOTDIR') return readRetiredAdmission(directory, admissionId);
    throw error;
  }
  if (!record || record.admissionId !== admissionId) throw new Error('Unknown admission ID');
  const state = await readJSON(join(directory, 'process.json'), null);
  if (prelaunchFailed(record, state)) {
    const result = { outcome: 'failed', summary: record.prelaunchFailure.summary, evidence: [], question: '' };
    const output = { ...record, state: 'failed', launch: 'never-launched', terminationVerified: true, exitCode: null, result };
    await atomic(join(directory, 'result.json'), output);
    return output;
  }
  const run = await foldWorkerEvents(directory, record);
  const { reconciled, terminationVerified } = workerTermination(state, directory, admissionId);
  const result = workerOutcome(state, terminationVerified, run);
  const launch = workerLaunch(state, terminationVerified, run);
  const output = { ...record, sessionId: run.newSession || null, launch, state: result.outcome, terminationVerified, exitCode: state?.exitCode ?? null, result };
  const diagnosticCode = await workerDiagnostic(directory, state, terminationVerified, run);
  if (diagnosticCode) output.diagnosticCode = diagnosticCode;
  const timing = launch === 'session' ? runnerTiming(state?.timing, admissionId, reconciled) : null;
  if (timing) output.timing = timing;
  if (terminationVerified || state?.admissionRejected) await atomic(join(directory, 'result.json'), output);
  return output;
}
