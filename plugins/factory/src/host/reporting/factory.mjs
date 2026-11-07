import { join, basename, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jsonFile, directories, canonicalRoots } from './files.mjs';
import { lstat, readdir } from 'node:fs/promises';
import { validTerminationProof } from './proof.mjs';
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
function terminalRecord(r,p,channel) {
  // Proof belongs to this invocation (validated before here); terminal alone is not proof.
  const failure=r.prelaunchFailure;
  if(!p && failure?.proof==='never-launched' && ['preparation','guardian-spawn'].includes(failure.phase) &&
    typeof failure.summary==='string' && failure.summary.length>0 && r.sessionId===null)return true;
  return p?.state==='exited' && (p.cleanupVerified===true ||
    (channel==='desktop' && r.terminal===true && p.cleanupVerified!==false));
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
function validateInvocation(binding,p,directory) {
  if(binding.invocationId!==basename(directory) || !['codex','claude'].includes(binding.executor))throw new Error('invalid-source');
  if(typeof binding.cwd!=='string' || !isAbsolute(binding.cwd))throw new Error('invalid-source');
  if(p && (p.runId!==binding.invocationId || !['starting','running','exited'].includes(p.state)))throw new Error('invalid-source');
}
async function directoryEvidence(directory) {
  const names = (await readdir(directory)).sort();
  if (names.length > 64) throw new Error('incomplete');
  const relevant=names.filter(name=>['run.json','admission.json','process.json','job.json','result.json','reconciliation.json'].includes(name));
  const stats = await Promise.all(relevant.map(async name => {
    const value = await lstat(join(directory, name));
    if (value.isSymbolicLink()) throw new Error('invalid-source');
    return [name, value.ino, value.size, value.mtimeMs];
  }));
  return { names, signature: JSON.stringify([names,stats]) };
}
async function recordInstance(directory, channel, options) {
  const before = await directoryEvidence(directory);
  const row = await classifyRecord(directory, channel, options, before.names);
  if ((await directoryEvidence(directory)).signature !== before.signature) throw new Error('incomplete');
  return row;
}
function validOwnedIdentity(row) {
  const stamp=row.identity;
  return Number.isSafeInteger(row.pid)&&row.pid>1&&Array.isArray(stamp)&&stamp.length===6&&
    Number.isInteger(stamp[0])&&stamp[0]>=0&&stamp.slice(1).every(v=>typeof v==='string'&&v.length>0)&&
    Number.isFinite(Date.parse(stamp.slice(1).join(' ')));
}
export async function ownedProcessesLive(entries,run=exec) {
  if(!Array.isArray(entries)||entries.length===0||entries.length>64)throw new Error('unavailable');
  const environment={...process.env,LC_ALL:'C'};delete environment.TZ;
  const {stdout}=await run('ps',['-axo','pid=,uid=,lstart='],{timeout:3000,maxBuffer:1048576,env:environment});
  const current=new Map();
  for(const line of stdout.split('\n').filter(v=>v.trim())) {
    const words=line.trim().split(/\s+/);
    if(words.length!==7)throw new Error('unavailable');
    current.set(Number(words[0]),words.slice(1).join(' '));
  }
  for(const row of entries) {
    if(!validOwnedIdentity(row))throw new Error('unavailable');
    if(current.get(row.pid)===row.identity.map(String).join(' '))return true;
  }
  return false;
}
async function reconciledExit(directory, p, binding, options) {
  if (p?.state !== 'exited' || p.cleanupVerified !== false) return false;
  const entries = [[p.guardianPid,p.guardianIdentity],[p.claudePid,p.claudeIdentity]];
  for (const [pid,identity] of entries) {
    if (identity && await options.lookup(pid) === identity) return false;
  }
  if(!await options.proof(directory,binding.invocationId))return false;
  return !await options.ownedLive(p.ownedProcesses);
}
function preparationOnly(record,names) {
  return names.length===1 && names[0]==='admission.json' && record.sessionId===null && record.state==='admitted' && !record.prelaunchFailure;
}
function uncertainInstance(record,instance) {
  return record.terminal===true || ['unknown','cleanup-unverified'].includes(instance.state) || !instance.projectIds.length;
}
async function classifyRecord(directory, channel, options, names) {
  if (names.length === 0) return { historyIssue:{invocationId:basename(directory),reason:'empty-reservation'} };
  const record=await jsonFile(join(directory,channel==='desktop'?'run.json':'admission.json'));
  const r=record.data,p=await optionalJson(join(directory,'process.json'));
  const binding=bindingFor(r,channel);
  validateInvocation(binding,p,directory);
  if (channel==='unattended' && preparationOnly(r,names)) {
    return { uncertain:true, historyIssue:{invocationId:binding.invocationId,reason:'incomplete-preparation'} };
  }
  const result=channel==='unattended'?await optionalJson(join(directory,'result.json')):null;
  const outcome=(result?.admissionId===binding.invocationId?result.result?.outcome:null) ?? r.result?.outcome;
  const lastOutcome=outcomes.has(outcome)?outcome:null;
  const created=Number.isFinite(r.createdAt)?r.createdAt:Date.parse(record.at);
  if(terminalRecord(r,p,channel))return {lastOutcome,created};
  if (channel==='unattended' && await reconciledExit(directory,p,binding,options)) return {lastOutcome,created};
  const instance=await activeInstance(r,p,binding,created,channel,options);
  return {instance,lastOutcome,created,uncertain:uncertainInstance(r,instance)};
}
async function rootRecords(root,channel,options) {
  const rows=[];let complete=true;let names;
  try { names=await directories(join(root,channel==='desktop'?'runs':'unattended')); }
  catch {return {rows,complete:false};}
  for(const name of names) {
    if(!/^[0-9a-f-]{36}$/.test(name))continue;
    try { rows.push(await recordInstance(join(root,channel==='desktop'?'runs':'unattended',name),channel,options)); }
    catch {complete=false;}
  }
  return {rows,complete};
}
function censusResult(rows,complete) {
  const instances=new Map(),historyIssues=[];let lastOutcome=null,latest=-1;
  for(const row of rows) {
    if(row.uncertain)complete=false;
    if(row.historyIssue)historyIssues.push(row.historyIssue);
    if(row.instance)instances.set(row.instance.invocationId,row.instance);
    if(row.lastOutcome&&row.created>=latest){latest=row.created;lastOutcome=row.lastOutcome;}
  }
  const all=[...instances.values()];
  if(all.length>64||historyIssues.length>64)complete=false;
  return {complete,instances:all.slice(0,64),lastOutcome,...(historyIssues.length?{historyIssues:historyIssues.slice(0,64)}:{})};
}
export async function observeFactory({roots,channel,hostId,projects,accounts={},lookup=processIdentity,proof=validTerminationProof,ownedLive=ownedProcessesLive}) {
  const rows=[];let complete=true;
  for(const root of await canonicalRoots(roots)) {
    const result=await rootRecords(root,channel,{hostId,projects,accounts,lookup,proof,ownedLive});
    rows.push(...result.rows);complete=complete&&result.complete;
  }
  return censusResult(rows,complete);
}
