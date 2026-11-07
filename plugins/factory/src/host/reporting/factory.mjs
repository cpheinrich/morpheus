import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jsonFile, directories, canonicalRoots } from './files.mjs';
const exec = promisify(execFile);
const hash = v => createHash('sha256').update(v).digest('hex').slice(0,32);
const outcomes = new Set(['completed','needs_input','failed','interrupted']);
export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try { return (await exec('ps', ['-p', String(pid), '-o','lstart=', '-o','pgid=', '-o','uid='], { timeout: 2000, maxBuffer: 2048 })).stdout.trim() || null; }
  catch (e) { if (e.code === 1) return null; throw new Error('unavailable'); }
}
function projectsFor(record, mapping) {
  // Common Git directories are stable across future task worktrees; no basename guessing.
  const paths = [record.cwd, ...Object.entries(record.workspace ?? {}).flatMap(([common,v]) => [common,v.path])];
  const entries = Object.entries(mapping);
  const projects = paths.flatMap(path => entries.filter(([prefix]) => path === prefix || path?.startsWith(prefix + '/')).map(([,project]) => project));
  return [...new Set(projects)].sort();
}
async function optionalJson(path) {
  try { return (await jsonFile(path)).data; }
  catch(e) { if(e.code==='ENOENT')return null;throw e; }
}
function terminalRecord(r,p) {
  if(r.prelaunchFailure?.proof === 'never-launched') return true;
  if(p?.state === 'exited' && p.cleanupVerified === true) return true;
  return r.terminal === true && p?.cleanupVerified !== false;
}
function bindingFor(r,channel) {
  if(channel === 'desktop') return {executor:r.executor,invocationId:r.id,cwd:r.cwd,gateway:r.gateway,task:r.threadId,workspace:r.workspace,selection:r.selection};
  return {executor:r.binding?.gateway?.provider,invocationId:r.admissionId,cwd:r.binding?.cwd,gateway:r.binding?.gateway?.name,task:r.binding?.jobId,workspace:{},selection:r.binding};
}
function observedStart(r,p) {
  const value=p?.timing?.startedAt??r.createdAt;
  if(value==null || !Number.isFinite(new Date(value).getTime()))return null;
  return new Date(value).toISOString();
}
const observedLabel=v=>typeof v==='string'&&/^[\w .:/()\[\]-]{1,100}$/.test(v)?v:null;
async function activeInstance(r,p,binding,created,channel,options) {
  const {executor,invocationId,gateway}=binding;
  if (!['codex','claude'].includes(executor) || !invocationId) throw new Error('invalid-source');
  const current = p?.state === 'running' ? await options.lookup(p.guardianPid) : null;
  const matched = !!p?.guardianIdentity && current === p.guardianIdentity;
  const state = p?.state === 'exited' ? 'cleanup-unverified' : matched ? (r.state === 'starting' ? 'starting' : 'running') : 'unknown';
  const accountId = options.accounts[gateway] ?? null;
  return { id: hash(options.hostId + channel + (binding.task ?? invocationId)), invocationId, executor, accountId,
    projectIds: projectsFor(binding, options.projects), state,createdAt:observedStart(r,p),hostId:options.hostId,
    taskId:binding.task??null,model:observedLabel(binding.selection?.model),
    effort:['none','minimal','low','medium','high','xhigh','max','ultra'].includes(binding.selection?.effort)?binding.selection.effort:null };
}
async function recordInstance(directory, channel, options) {
  const record=await jsonFile(join(directory,channel==='desktop'?'run.json':'admission.json'));
  const r=record.data,p=await optionalJson(join(directory,'process.json'));
  const result=channel==='unattended'?await optionalJson(join(directory,'result.json')):null;
  const outcome=result?.result?.outcome ?? r.result?.outcome;
  const lastOutcome=outcomes.has(outcome)?outcome:null;
  const created=Number.isFinite(r.createdAt)?r.createdAt:Date.parse(record.at);
  if(terminalRecord(r,p))return {lastOutcome,created};
  return {instance:await activeInstance(r,p,bindingFor(r,channel),created,channel,options),lastOutcome,created};
}
export async function observeFactory({ roots, channel, hostId, projects, accounts = {}, lookup = processIdentity }) {
  const instances = new Map(); let complete = true; let lastOutcome = null; let latest = -1;
  for (const root of await canonicalRoots(roots)) {
    let names;
    try { names = await directories(join(root, channel === 'desktop' ? 'runs' : 'unattended')); }
    catch { complete = false; continue; }
    for (const name of names) {
      if (!/^[0-9a-f-]{36}$/.test(name)) continue;
      try {
        const row = await recordInstance(join(root,channel === 'desktop' ? 'runs' : 'unattended',name), channel, {hostId,projects,accounts,lookup});
        if (row.instance) {instances.set(row.instance.invocationId, row.instance);if(!row.instance.projectIds.length)complete=false;}
        if (row.lastOutcome && row.created >= latest) { latest = row.created; lastOutcome = row.lastOutcome; }
      } catch { complete = false; }
    }
  }
  const all = [...instances.values()];
  if(all.length > 64) complete = false;
  return { complete, instances: all.slice(0,64), lastOutcome };
}
