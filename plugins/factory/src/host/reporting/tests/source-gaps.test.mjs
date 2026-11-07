import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {observeFactory,ownedProcessesLive} from '../factory.mjs';
import {validTerminationProof} from '../proof.mjs';
import {githubSnapshot} from '../github.mjs';
import {dispatcherInventory} from '../runner-inventory.mjs';
const id='11111111-1111-4444-8888-111111111111',at='2026-11-07T08:00:00Z';
const put=async(path,value)=>writeFile(path,JSON.stringify(value),{mode:0o600});
async function root(t){const p=await mkdtemp(join(tmpdir(),'reporting-gaps-'));t.after(()=>rm(p,{recursive:true,force:true}));return p;}
function options(path,channel='desktop'){return {roots:[path],channel,hostId:'host-example',projects:{'/repo/example':'example/a'},lookup:async()=>null,ownedLive:async()=>false};}
test('empty reservation is separate from an admitted preparation record and never written as never-launched',async t=>{
  const path=await root(t);await mkdir(join(path,'runs',id),{recursive:true});
  const desktop=await observeFactory(options(path));assert.equal(desktop.complete,true);assert.deepEqual(desktop.instances,[]);assert.deepEqual(desktop.historyIssues,[{invocationId:id,reason:'empty-reservation'}]);
  const dir=join(path,'unattended',id);await mkdir(dir,{recursive:true});
  await put(join(dir,'admission.json'),{admissionId:id,state:'admitted',sessionId:null,binding:{cwd:'/repo/example',gateway:{provider:'codex'},jobId:'example'}});
  const before=await readFile(join(dir,'admission.json'));
  const unattended=await observeFactory(options(path,'unattended'));assert.equal(unattended.complete,false);assert.deepEqual(unattended.instances,[]);assert.deepEqual(unattended.historyIssues,[{invocationId:id,reason:'incomplete-preparation'}]);assert.deepEqual(await readFile(join(dir,'admission.json')),before);
  await put(join(dir,'job.json'),{runId:id});
  const launch=await observeFactory(options(path,'unattended'));assert.equal(launch.complete,false);assert.equal(launch.instances[0].state,'unknown');
});
test('canonical hash proof excludes a reconciled exit only without contradictory current identity',async t=>{
  const path=await root(t),dir=join(path,'unattended',id);await mkdir(dir,{recursive:true});
  await put(join(dir,'admission.json'),{admissionId:id,binding:{cwd:'/repo/example',gateway:{provider:'codex'},jobId:'example'}});
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:false,guardianPid:42,guardianIdentity:'matching'});
  const digest=async file=>createHash('sha256').update(await readFile(join(dir,file))).digest('hex');
  await put(join(dir,'reconciliation.json'),{version:1,admissionId:id,processSha256:await digest('process.json'),admissionSha256:await digest('admission.json')});
  assert.equal(await validTerminationProof(dir,id),true);
  const safe=await observeFactory(options(path,'unattended'));assert.equal(safe.complete,true);assert.deepEqual(safe.instances,[]);
  const child=await observeFactory({...options(path,'unattended'),ownedLive:async()=>true});assert.equal(child.complete,false);assert.equal(child.instances.length,1);
  const live=await observeFactory({...options(path,'unattended'),lookup:async()=> 'matching'});assert.equal(live.complete,false);assert.equal(live.instances.length,1);
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:false,guardianPid:42,guardianIdentity:'changed'});
  assert.equal(await validTerminationProof(dir,id),false);assert.equal((await observeFactory(options(path,'unattended'))).complete,false);
  assert.equal((await readdir(dir)).some(n=>n.endsWith('.pyc')||n==='__pycache__'),false);
});
test('desktop without an unattended marker remains live from exact guardian identity; changing evidence is incomplete',async t=>{
  const path=await root(t),dir=join(path,'runs',id);await mkdir(dir,{recursive:true});
  await put(join(dir,'run.json'),{id,executor:'codex',cwd:'/repo/example',terminal:true});
  await put(join(dir,'process.json'),{runId:id,state:'running',guardianPid:42,guardianIdentity:'matching'});
  const live=await observeFactory({...options(path),lookup:async()=> 'matching'});assert.equal(live.instances[0].state,'running');assert.equal(live.complete,false);
  const raced=await observeFactory({...options(path),lookup:async()=>{await put(join(dir,'process.json'),{runId:id,state:'starting'});return 'matching';}});
  assert.equal(raced.complete,false);assert.deepEqual(raced.instances,[]);
});
function githubRead({failRunners=false,count=0,jobFailure=false}={}){return async path=>{
  if(path.includes('/runners')){if(failRunners)throw Error('PRIVATE');return {total_count:count,runners:Array.from({length:Math.min(count,100)},(_,i)=>({id:i+1,status:'online',busy:false,labels:[]}))};}
  if(path.includes('/jobs')){if(jobFailure)throw Error('PRIVATE');return {total_count:0,jobs:[]};}
  return path.includes('status=')?{total_count:0,workflow_runs:[]}:{total_count:472,workflow_runs:[{id:12,run_attempt:2}]};
};}
test('bounded recent history never negates complete repository runner census or another project',async()=>{
  const value=await githubSnapshot(['example/a'],githubRead(),()=>new Date(at));assert.equal(value.complete,true);assert.equal(value.value.censuses[0].runnerComplete,true);
  const jobs=await githubSnapshot(['example/a'],githubRead({jobFailure:true}),()=>new Date(at));assert.equal(jobs.complete,false);assert.equal(jobs.value.censuses[0].runnerComplete,true);assert.equal(jobs.value.censuses[0].jobComplete,false);
  const fail=await githubSnapshot(['example/a'],githubRead({failRunners:true}),()=>new Date(at));assert.equal(fail.value.censuses[0].runnerComplete,false);assert.equal(fail.value.orgCensus,'unavailable');
});
test('runner API and global wire truncation preserve explicit incomplete census',async()=>{
  const value=await githubSnapshot(['example/a','example/b'],githubRead({count:75}),()=>new Date(at));
  assert.equal(value.value.runners.length,100);assert.equal(value.value.censuses[0].runnerComplete,true);assert.equal(value.value.censuses[1].runnerComplete,false);
  assert.equal((await githubSnapshot(['example/a'],githubRead({count:101}),()=>new Date(at))).value.censuses[0].runnerComplete,false);
});
test('Linux owner inventory can prove explicit idle independently of disabled Tart; legacy null cannot',()=>{
  const cfg={host:'example-host',os:'linux',slots:1},source={projectIds:['example/a']};
  assert.deepEqual(dispatcherInventory(cfg,{slots:[null]},source,true),{});
  const state={runnerInventory:{version:1,host:'example-host',pool:'linux',complete:true,slots:[{slot:0,phase:'idle',projectId:null,runnerId:null}],uncertain:[]}};
  assert.equal(dispatcherInventory(cfg,state,source,true).inventoryComplete,true);
  state.runnerInventory.pool='macos';assert.equal(dispatcherInventory(cfg,state,source,true).inventoryComplete,false);
  state.runnerInventory.pool='linux';state.runnerInventory.uncertain=[{slot:0,projectId:'example/a',runnerId:18}];
  const uncertain=dispatcherInventory(cfg,state,source,true);assert.equal(uncertain.inventoryComplete,false);assert.deepEqual(uncertain.uncertainRegistrations,[{projectId:'example/a',runnerId:18}]);
});

test('standalone proof package executes canonical validator without creating Python bytecode',async t=>{
  const path=await root(t),installed=join(path,'reporting'),dir=join(path,'admission');await mkdir(join(installed,'proof'),{recursive:true});await mkdir(dir);
  for(const name of ['proof.mjs','files.mjs'])await copyFile(fileURLToPath(new URL('../'+name,import.meta.url)),join(installed,name));
  for(const name of ['termination_proof.py','owned_processes.py'])await copyFile(fileURLToPath(new URL('../../../'+name,import.meta.url)),join(installed,'proof',name));
  await put(join(dir,'admission.json'),{admissionId:id});await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:false});
  const digest=async file=>createHash('sha256').update(await readFile(join(dir,file))).digest('hex');
  await put(join(dir,'reconciliation.json'),{version:1,admissionId:id,processSha256:await digest('process.json'),admissionSha256:await digest('admission.json')});
  const module=await import(pathToFileURL(join(installed,'proof.mjs')).href);
  assert.equal(await module.validTerminationProof(dir,id),true);assert.deepEqual((await readdir(join(installed,'proof'))).sort(),['owned_processes.py','termination_proof.py']);
});

test('current owned identity census detects contradictions without markers or process argv',async()=>{
  const entries=[{pid:42,identity:[501,'Fri','Nov','6','22:00:00','2026']}];let command;
  const run=async(file,args)=>{command=[file,args];return {stdout:'42 501 Fri Nov 6 22:00:00 2026\n'};};
  assert.equal(await ownedProcessesLive(entries,run),true);assert.deepEqual(command,['ps',['-axo','pid=,uid=,lstart=']]);
  assert.equal(await ownedProcessesLive(entries,async()=>({stdout:'42 501 Sat Nov 7 22:00:00 2026\n'})),false);
  await assert.rejects(ownedProcessesLive([],run),/unavailable/);await assert.rejects(ownedProcessesLive(entries,async()=>({stdout:'unreadable'})),/unavailable/);
});
