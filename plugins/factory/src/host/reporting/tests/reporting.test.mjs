import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { observeFactory } from '../factory.mjs';
import { readStoredQuota, storedQuota } from '../quota.mjs';
import { githubSnapshot } from '../github.mjs';
import { snapshot, send, configSchema } from '../reporter.mjs';
import { parseReport, freshness } from '../protocol.mjs';
import { installReporter } from '../install.mjs';
import { privateConfig } from '../files.mjs';
import { machine, dispatcher, persistentRunners } from '../sources.mjs';
const uuid='00000000-0000-4000-8000-000000000001';
const at='2026-11-06T23:00:00.000Z';
const binding={id:'gateway-a-2',instanceId:'gateway-a',accountId:2,provider:'codex',baseUrl:'https://gateway.example'};
const baseConfig={version:1,hostId:'host-a',endpoint:'https://hq.example/api/infra/ingest',tokenEnv:'INFRA_TOKEN',projectPaths:{},routeAccounts:{},sources:[{id:'machine',kind:'machine'}]};
const sample={kind:'machine',sampledAt:at,sourceObservedAt:at,status:'ok',errorCode:null,value:{cpuPercent:0,memoryTotalBytes:16,memoryActiveBytes:0,diskAvailableBytes:0,diskTotalBytes:32,uptimeSeconds:0,hardwareModel:'DemoMac',chip:'Apple M3',logicalCores:8,osVersion:'macOS 26.1'}};
async function temp(t){const path=await mkdtemp(join(tmpdir(),'infra-test-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function put(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(data),{mode:0o600});}
async function tree(path){const rows=[];for(const name of (await readdir(path)).sort()){const p=join(path,name);const s=await lstat(p);rows.push([name,s.isDirectory()?await tree(p):(await readFile(p)).toString()]);}return rows;}
test('desktop and unattended census never writes recovery or copies private fields',async t=>{
 const root=await temp(t);const dir=join(root,'runs',uuid);
 await put(join(dir,'run.json'),{id:uuid,threadId:'task-a',executor:'codex',gateway:'codex',createdAt:Date.parse(at),selection:{model:'gpt-demo-1',effort:'high'},cwd:'/repo/a',workspace:{other:{path:'/repo/b'}},state:'running',question:'PRIVATE',result:{secret:'PRIVATE'},terminal:false});
 await put(join(dir,'process.json'),{state:'running',guardianPid:12,guardianIdentity:'identity'});
 await mkdir(join(root,'unattended'));const before=await tree(root);
 const options={roots:[root,root],channel:'desktop',hostId:'host-a',projects:{'/repo/a':'example/a','/repo/b':'example/b'},accounts:{codex:'gateway-a-2'},lookup:async pid=>{assert.equal(pid,12);return 'identity';}};
 const value=await observeFactory(options);
 assert.equal(value.complete,true);assert.equal(value.instances.length,1);
 assert.deepEqual(value.instances[0].projectIds,['example/a','example/b']);assert.equal(value.instances[0].accountId,'gateway-a-2');assert.equal(value.instances[0].state,'running');
 assert.equal(value.instances[0].taskId,'task-a');assert.equal(value.instances[0].hostId,'host-a');assert.equal(value.instances[0].model,'gpt-demo-1');assert.equal(value.instances[0].effort,'high');assert.equal(value.instances[0].createdAt,at);
 const stable=await observeFactory({...options,projects:{other:'example/b'}});
 assert.deepEqual(stable.instances[0].projectIds,['example/b']);
 assert.equal(JSON.stringify(value).includes('PRIVATE'),false);assert.equal(JSON.stringify(value).includes('/repo'),false);
 assert.deepEqual(await tree(root),before);
 await put(join(dir,'process.json'),{state:'exited',cleanupVerified:false});
 await put(join(dir,'run.json'),{id:uuid,executor:'codex',terminal:true,cwd:'/repo/a'});
 assert.equal((await observeFactory(options)).instances[0].state,'cleanup-unverified');
 assert.equal((await observeFactory({...options,channel:'unattended'})).instances.length,0);
});
test('unattended roots include service admissions; incomplete census cannot mean idle',async t=>{
 const root=await temp(t);const dir=join(root,'unattended',uuid);
 await put(join(dir,'admission.json'),{admissionId:uuid,binding:{jobId:'steward',cwd:'/repo/a',gateway:{provider:'codex',name:'codex'}}});
 await put(join(dir,'process.json'),{state:'running',guardianPid:12,guardianIdentity:'identity'});
 const options={roots:[root],channel:'unattended',hostId:'host-a',projects:{'/repo/a':'example/a'},lookup:async()=> 'identity'};
 assert.equal((await observeFactory(options)).instances[0].executor,'codex');
 assert.equal((await observeFactory(options)).instances[0].createdAt,null);
 await writeFile(join(dir,'admission.json'),'not-json');
 assert.deepEqual(await observeFactory(options),{complete:false,instances:[],lastOutcome:null});
});
test('passive quota binds exact instance/account and preserves old timestamps/reset windows',async()=>{
 const account={id:2,platform:'openai',extra:{codex_usage_updated_at:'2026-11-06T00:00:00Z',codex_5h_used_percent:9,codex_5h_reset_at:1794000000}};
 const expected=storedQuota(account,binding);
 assert.equal(expected.sourceObservedAt,'2026-11-06T00:00:00.000Z');assert.equal(expected.value.windows[0].usedPercent,9);
 assert.equal(freshness({...sample,kind:'quota',sourceObservedAt:expected.sourceObservedAt,value:expected.value},Date.parse(at)),'stale');
 const calls=[];
 const result=await readStoredQuota(binding,{email:'user',password:'hidden',fetchImpl:async(url)=>{calls.push(new URL(url).pathname);return Response.json({data:calls.length===1?{access_token:'token'}:account});}});
 assert.deepEqual(calls,['/api/v1/auth/login','/api/v1/admin/accounts/2']);assert.deepEqual(result,expected);
 assert.throws(()=>storedQuota({...account,id:3},binding),/invalid-source/);
 assert.throws(()=>storedQuota(account,{...binding,instanceId:'other'}),/invalid-source/);
 const claude=storedQuota({id:1,platform:'anthropic',extra:{passive_usage_sampled_at:at,passive_usage_7d_utilization:0.82,passive_usage_7d_reset:at}},
  {...binding,id:'gateway-a-1',accountId:1,provider:'claude'});
 assert.equal(claude.value.windows[0].usedPercent,82);
});
test('GitHub de-duplicates projects and uses exact job attempts; errors are partial',async()=>{
 const calls=[];
 const result=await githubSnapshot(['example/a','example/a'],async path=>{
  calls.push(path);
  if(path.includes('runners'))throw Error('private provider error');
  if(path.includes('/jobs'))return {total_count:1,jobs:[{id:7,runner_id:18,name:'Unit checks',steps:[{name:'Compile',status:'in_progress'}],status:'in_progress',conclusion:null}]};
  return {total_count:1,workflow_runs:[{id:22,run_attempt:3}]};
 });
 assert.equal(calls.length,4);assert.equal(result.complete,false);assert.equal(result.value.jobs[0].attempt,3);
 assert.equal(result.value.jobs[0].runnerId,18);assert.equal(result.value.jobs[0].url,'https://github.com/example/a/actions/runs/22/job/7');
 assert.equal(result.value.jobs[0].name,'Unit checks');assert.equal(result.value.jobs[0].currentStep,'Compile');
 assert.ok(calls.includes('repos/example/a/actions/runs/22/attempts/3/jobs?per_page=100&page=1'));
 assert.equal(JSON.stringify(result).includes('private provider'),false);
});
test('protocol boundaries reject unknown fields, invalid ranges and clock skew',()=>{
 const report={schemaVersion:1,hostId:'host-a',samples:{machine:sample}};
 assert.equal(parseReport(report,Date.parse(at)).samples.machine.value.cpuPercent,0);
 assert.throws(()=>parseReport({...report,secret:'x'},Date.parse(at)),/invalid-report/);
 assert.throws(()=>parseReport({...report,samples:{machine:{...sample,value:{...sample.value,cpuPercent:101}}}},Date.parse(at)),/invalid-report/);
 assert.throws(()=>parseReport(report,Date.parse(at)-60001),/source-clock/);
 assert.equal(parseReport(report,Date.parse(at)-60000).hostId,'host-a');
 assert.equal(freshness(sample,Date.parse(at)+180000),'fresh');assert.equal(freshness(sample,Date.parse(at)+180001),'stale');
});
test('a failed/malformed source cannot leak its data or suppress healthy samples; transport refuses redirects',async()=>{
 const config={...baseConfig,sources:[{id:'machine',kind:'machine'},{id:'bad',kind:'phone'}]};
 const report=await snapshot(config,{now:()=>new Date(at),read:async source=>{if(source.id==='bad')return {value:{token:'PRIVATE'}};return {value:sample.value};}});
 assert.equal(report.samples.machine.status,'ok');assert.deepEqual(report.samples.bad,{kind:'phone',sampledAt:at,sourceObservedAt:null,status:'error',errorCode:'invalid-source',value:null});
 let sent;
 await send(config,report,{env:{INFRA_TOKEN:'a'.repeat(32)},fetchImpl:async(url,options)=>{sent=options;return new Response(null,{status:200});}});
 assert.equal(sent.redirect,'error');assert.equal(JSON.parse(sent.body).samples.machine.value.cpuPercent,0);
 await assert.rejects(send(config,report,{env:{INFRA_TOKEN:'secret'},fetchImpl:()=>{throw Error('must not call');}}),/invalid-configuration/);
});
test('installer dry-run, actual isolated package import, unloaded-only install and rollback',async t=>{
 const root=await temp(t);const configPath=join(root,'reporting.json');await put(configPath,baseConfig);
 const options={destination:join(root,'runtime'),configPath,agentDir:join(root,'agents'),nodePath:process.execPath,label:'example.infra',dryRun:true};
 const dry=await installReporter(options);assert.match(dry.plist,/<integer>60<\/integer>/);
 await assert.rejects(lstat(options.destination),{code:'ENOENT'});
 const target=join(options.agentDir,'example.infra.plist');await mkdir(options.agentDir);await writeFile(target,'previous');
 const host=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
 const run=async(command,args,opts)=>{
  if(command==='/bin/launchctl')throw Object.assign(Error('not loaded'),{code:113});
  if(command==='pnpm'){await symlink(join(host,'node_modules'),join(options.destination,'node_modules'));return;}
  execFileSync(command,args,opts);
 };
 const result=await installReporter({...options,dryRun:false},{run});assert.equal(result.loaded,false);
 assert.equal(await readFile(target+'.previous','utf8'),'previous');
 await installReporter({...options,dryRun:false,rollback:true},{run});assert.equal(await readFile(target,'utf8'),'previous');
 await assert.rejects(installReporter({...options,dryRun:false},{run:async()=>({})}),/unload-reporter/);
});
test('configuration refuses credential-shaped inline fields and service source project roots are explicit',()=>{
 assert.equal(configSchema.safeParse(baseConfig).success,true);
 assert.equal(configSchema.safeParse({...baseConfig,token:'PRIVATE'}).success,false);
 assert.equal(configSchema.safeParse({...baseConfig,endpoint:'https://user:secret@hq.example/'}).success,false);
});
test('reporting configuration cannot be tracked in Git or reached through a file symlink',async t=>{
 const root=await temp(t);const config=join(root,'config.json');await put(config,baseConfig);
 const link=join(root,'link.json');await symlink(config,link);await assert.rejects(privateConfig(link),/invalid-source/);
 await mkdir(join(root,'.git'));await assert.rejects(privateConfig(config),/outside-git/);
});
test('machine inventory reports observed model, chip, logical cores and macOS version',async()=>{
 const result=await machine({currentLoad:async()=>({currentLoad:12}),mem:async()=>({total:16,active:8}),fsSize:async()=>[{mount:'/',available:10,size:20}],
  system:async()=>({model:'MacDemo1,1',serial:'PRIVATE'}),cpu:async()=>({brand:'Apple M3',cores:8}),osInfo:async()=>({distro:'macOS',release:'26.1'})});
 assert.equal(result.value.hardwareModel,'MacDemo1,1');assert.equal(result.value.logicalCores,8);assert.equal(result.value.chip,'Apple M3');assert.equal(result.value.osVersion,'macOS 26.1');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
test('dispatcher and persistent metadata bind real runner IDs without guessing names',async t=>{
 const root=await temp(t),configPath=join(root,'pool.json'),statePath=join(root,'state.json');
 await put(configPath,{slots:2,cpu:6,memoryMb:16384,simulatorLanes:2,extraLabels:['macos-vm']});
 await put(statePath,{updatedAt:at,slots:[{repo:'example/a',runnerId:18},{repo:'other/private',runnerId:19}]});
 const result=await dispatcher({configPath,statePath,tartPath:'/tart',projectIds:['example/a'],roles:['ci']},{running:async()=>true,run:async()=>({stdout:'[]'})});
 assert.equal(result.value.cpuPerSlot,6);assert.equal(result.value.memoryMbPerSlot,16384);assert.equal(result.value.simulatorLanes,2);
 assert.deepEqual(result.value.allocations,[{slot:0,projectId:'example/a',runnerId:18}]);
 const metadataPath=join(root,'.runner');await put(metadataPath,{agentId:21,agentName:'misleading-name',gitHubUrl:'https://github.com/example',workFolder:'PRIVATE'});
 const runner=await persistentRunners({entries:[{metadataPath,scope:'organization',projectIds:['example/a'],roles:['device-gate'],labels:['physical-phone']}]});
 assert.deepEqual(runner.value.registrations,[{runnerId:21,scope:'organization',projectId:'example/a',roles:['device-gate'],labels:['physical-phone']}]);
 assert.equal(JSON.stringify(runner).includes('PRIVATE'),false);
 const wrong=await persistentRunners({entries:[{metadataPath,scope:'repository',projectIds:['other/private'],roles:[],labels:[]}]});assert.equal(wrong.complete,false);
});
test('oversized valid source becomes unavailable without dropping the machine heartbeat',async()=>{
 const report=await snapshot({...baseConfig,sources:[{id:'machine',kind:'machine'},{id:'github',kind:'github'}]},{now:()=>new Date(at),read:async source=>source.id==='machine'?{value:sample.value}:{value:{jobs:[],orgCensus:'unavailable',runners:Array.from({length:100},(_,runnerId)=>({projectId:'example/a',runnerId,online:true,busy:false,labels:Array(20).fill('x'.repeat(160))}))}}});
 assert.equal(report.samples.machine.status,'ok');assert.equal(report.samples.github.status,'error');assert.equal(report.samples.github.errorCode,'incomplete');
 assert.ok(Buffer.byteLength(JSON.stringify(report))<=65536);
});
