import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';
import { jsonFile } from './files.mjs';
import { scheduledTaskDocument } from './protocol.mjs';
import { observeFactory } from './factory.mjs';
import { readStoredQuota, readProviderQuota } from './quota.mjs';
import { githubSnapshot } from './github.mjs';
import { observePhone } from './phone.mjs';
import { dispatcherInventory } from './runner-inventory.mjs';
import { readFile,lstat } from 'node:fs/promises';
import { dirname,join } from 'node:path';
const exec = promisify(execFile);
async function serviceRunning(label) {
  try {
    const r = await exec('/bin/launchctl',['print',`gui/${process.getuid()}/${label}`],{timeout:2000,maxBuffer:32768});
    return /^\s*state = running$/m.test(r.stdout);
  } catch(e) { if(e.code === 113) return false; return null; }
}
export async function machine(inventory=si) {
  const [load,mem,disks,system,cpu,version] = await Promise.all([inventory.currentLoad(),inventory.mem(),inventory.fsSize(),inventory.system(),inventory.cpu(),inventory.osInfo()]);
  const disk = disks.find(d => d.mount === '/');
  if(!disk) throw new Error('unavailable');
  return {value:{cpuPercent:load.currentLoad,memoryTotalBytes:mem.total,memoryActiveBytes:mem.active,
    diskAvailableBytes:disk.available,diskTotalBytes:disk.size,uptimeSeconds:os.uptime(),
    hardwareModel:system.model??null,chip:cpu.brand??null,logicalCores:cpu.cores??null,osVersion:version.release?`${version.distro} ${version.release}`:null}};
}
export async function dispatcher(source,{run=exec,running=serviceRunning}={}) {
  const [{data:c},{data:s}] = await Promise.all([jsonFile(source.configPath),jsonFile(source.statePath)]);
  const active = await running(source.serviceLabel);
  let runningVms = null;
  try {
    const list = JSON.parse((await run(source.tartPath,['list','--format','json'],{timeout:3000,maxBuffer:65536})).stdout);
    runningVms = list.filter(v => v.State === 'running' || v.state === 'running').length;
  } catch { /* independent optional observation; never substitute configured slots */ }
  return {sourceObservedAt:s.updatedAt,complete:active !== null && Array.isArray(s.slots),value:{serviceRunning:active,
    configuredSlots:c.slots,cpuPerSlot:c.cpu,memoryMbPerSlot:c.memoryMb,
    allocations:(s.slots ?? []).flatMap((slot,index)=>slot && source.projectIds.includes(slot.repo) ? [{slot:index,projectId:slot.repo,runnerId:slot.runnerId ?? null}]:[]),
    runningVms,nullSlotsAmbiguous:true,unreportedSlots:(s.slots??[]).filter(v=>v===null).length,
    simulatorLanes:c.simulatorLanes??null,roles:source.roles,labels:c.extraLabels??[],...dispatcherInventory(c,s,source,active)}};
}
async function listenerState(metadataPath) {
  try {
    const service=join(dirname(metadataPath),'.service');
    const info=await lstat(service);
    if(!info.isFile()||info.isSymbolicLink()||info.size>4096)return 'unknown';
    let label=(await readFile(service,'utf8')).trim();
    if(label.startsWith('/'))label=(await exec('/usr/bin/plutil',['-extract','Label','raw','-o','-',label],{timeout:2000,maxBuffer:4096})).stdout.trim();
    if(!/^[\w.-]{1,150}$/.test(label))return 'unknown';
    const state=await serviceRunning(label);
    return state===null?'unknown':state?'running':'stopped';
  } catch {return 'unknown';}
}
export async function persistentRunners(source) {
  const registrations=[];let complete=true;
  for(const entry of source.entries) {
    try {
      const {data:r}=await jsonFile(entry.metadataPath);const url=new URL(r.gitHubUrl);
      if(url.hostname!=='github.com'||!Number.isSafeInteger(r.agentId)||r.agentId<1)throw new Error('invalid-source');
      for(const projectId of entry.projectIds) {
        const expected=entry.scope==='organization'?'/'+projectId.split('/')[0]:'/'+projectId;
        if(url.pathname.replace(/\/$/,'').toLowerCase()!==expected.toLowerCase())throw new Error('invalid-source');
        registrations.push({runnerId:r.agentId,projectId,scope:entry.scope,roles:entry.roles,labels:entry.labels,
          ...(entry.observeListener?{listenerState:await listenerState(entry.metadataPath)}:{})});
      }
    }catch{complete=false;}
  }
  return {complete,value:{complete,registrations}};
}
export async function collect(source, config) {
  switch(source.kind) {
    case 'machine': return machine();
    case 'scheduledTasks': return scheduledTasks(source.statePath);
    case 'factory': {
      const value = await observeFactory({...source,hostId:config.hostId,projects:config.projectPaths,accounts:config.routeAccounts});
      return {value,complete:value.complete};
    }
    case 'routes': {
      const {data:c} = await jsonFile(source.configPath,{private:true});
      return {value:{enabled:c.mode !== 'off',maxConcurrent:c.maxConcurrent,
        routes:(c.gateways ?? []).map(g=>({id:g.name,provider:g.provider,accountId:config.routeAccounts[g.name] ?? null}))}};
    }
    case 'dispatcher': return dispatcher(source);
    case 'runners': return persistentRunners(source);
    case 'phone': return observePhone(source);
    case 'github': return githubSnapshot(source.repositories,undefined,undefined,{entries:source.organizationRunners??[],tokenEnv:source.organizationTokenEnv});
    case 'quota': return (source.mode==='provider'?readProviderQuota:readStoredQuota)(source.binding,{email:process.env[source.emailEnv],password:process.env[source.passwordEnv]});
    default: throw new Error('invalid-source');
  }
}

export async function scheduledTasks(statePath) {
  const {data} = await jsonFile(statePath,{private:true});
  const {observedAt,tasks} = scheduledTaskDocument.parse(data);
  return {sourceObservedAt:observedAt,value:{tasks}};
}
