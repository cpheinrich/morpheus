import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { id, parseReport, MAX_BYTES } from './protocol.mjs';
import { privateConfig } from './files.mjs';
import { collect } from './sources.mjs';
import {identityEntries} from './org-runners.mjs';
const path = z.string().refine(isAbsolute);
const variable = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const project = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
const source = z.discriminatedUnion('kind',[
  z.strictObject({id,kind:z.literal('machine')}),
  z.strictObject({id,kind:z.literal('scheduledTasks'),statePath:path}),
  z.strictObject({id,kind:z.literal('factory'),roots:z.array(path).min(1).max(8),channel:z.enum(['desktop','unattended'])}),
  z.strictObject({id,kind:z.literal('routes'),configPath:path}),
  z.strictObject({id,kind:z.literal('dispatcher'),configPath:path,statePath:path,serviceLabel:z.string().regex(/^[\w.-]{1,150}$/),tartPath:path,projectIds:z.array(project).max(16),roles:z.array(z.string().max(100)).max(20)}),
  z.strictObject({id,kind:z.literal('runners'),entries:z.array(z.strictObject({metadataPath:path,projectIds:z.array(project).min(1).max(16),
    scope:z.enum(['repository','organization']),observeListener:z.boolean().optional(),roles:z.array(z.string().max(100)).max(20),labels:z.array(z.string().max(100)).max(20)})).min(1).max(16)}),
  z.strictObject({id,kind:z.literal('phone'),leasePath:path,deviceUdid:z.string().regex(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/).optional()}),
  z.strictObject({id,kind:z.literal('github'),repositories:z.array(project).min(1).max(3),organizationTokenEnv:variable.refine(v=>!['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'].includes(v)).optional(),
    organizationRunners:z.array(z.strictObject({organization:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/),runnerId:z.number().int().positive(),projectIds:z.array(project).min(1).max(16)}).refine(e=>e.projectIds.every(p=>p.split('/')[0]===e.organization))).max(16).optional()}),
  z.strictObject({id,kind:z.literal('quota'),emailEnv:variable,passwordEnv:variable,mode:z.enum(['stored','provider']).optional(),
    binding:z.strictObject({id,instanceId:id,accountId:z.number().int().positive(),provider:z.enum(['codex','claude']),baseUrl:z.url(),subjectSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),gatewayOrigin:z.url().optional(),directEgress:z.literal(true).optional(),tailnetAddress:z.string().max(45).optional(),ssh:z.strictObject({host:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/),user:z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/),gatewayPort:z.number().int().min(1).max(65535)}).optional()})}),
]);
export const configSchema = z.strictObject({version:z.literal(1),hostId:id,
  endpoint:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash;}),
  tokenEnv:variable,projectPaths:z.record(path,project),routeAccounts:z.record(id,id),sources:z.array(source).min(1).max(16),
}).refine(c=>new Set(c.sources.map(s=>s.id)).size===c.sources.length).refine(c=>{try{for(const s of c.sources)if(s.kind==='github')identityEntries(s.organizationRunners??[]);return true;}catch{return false;}});
export async function snapshot(config,{read=collect,now=()=>new Date()}={}) {
  const sampledAt = now().toISOString();
  const samples = Object.fromEntries(await Promise.all(config.sources.map(async source=>{
    try {
      const observation = await read(source,config);
      return [source.id,{kind:source.kind,sampledAt,sourceObservedAt:'sourceObservedAt' in observation ? observation.sourceObservedAt : sampledAt,
        status:observation.complete===false?'partial':'ok',errorCode:observation.complete===false?'incomplete':null,value:observation.value}];
    } catch { return [source.id,{kind:source.kind,sampledAt,sourceObservedAt:null,status:'error',errorCode:'unavailable',value:null}]; }
  })));
  // Invalid adapter output cannot leak private fields or take down other sources.
  for(const [key,sample] of Object.entries(samples)) {
    try { parseReport({schemaVersion:1,hostId:config.hostId,samples:{[key]:sample}},Date.parse(sampledAt)); }
    catch { samples[key]={kind:sample.kind,sampledAt,sourceObservedAt:null,status:'error',errorCode:'invalid-source',value:null}; }
  }
  const report={schemaVersion:1,hostId:config.hostId,samples};
  // A large but valid source must not suppress the independent machine heartbeat.
  const largest=Object.keys(samples).sort((a,b)=>JSON.stringify(samples[b]).length-JSON.stringify(samples[a]).length);
  for(const key of largest) {
    if(Buffer.byteLength(JSON.stringify(report))<=MAX_BYTES)break;
    samples[key]={kind:samples[key].kind,sampledAt,sourceObservedAt:null,status:'error',errorCode:'incomplete',value:null};
  }
  return report;
}
export async function send(config,report,{fetchImpl=fetch,env=process.env}={}) {
  const token=env[config.tokenEnv];
  if(typeof token!=='string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) throw new Error('invalid-configuration');
  const body=JSON.stringify(report);
  if(Buffer.byteLength(body)>MAX_BYTES) throw new Error('oversized-report');
  const res=await fetchImpl(config.endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body,signal:AbortSignal.timeout(15000)});
  if(!res.ok) throw new Error('transport-unavailable');
}
export async function main(args=process.argv.slice(2)) {
  try {
    if(args.length!==2 || args[0]!=='--config') throw new Error('invalid-configuration');
    const config=configSchema.parse(await privateConfig(args[1]));
    await send(config,await snapshot(config));
  } catch { process.stderr.write('Infrastructure telemetry unavailable.\n');process.exitCode=1; }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
