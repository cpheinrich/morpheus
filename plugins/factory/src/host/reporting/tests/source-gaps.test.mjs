import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {observeFactory as nativeObserveFactory,ownedProcessesLive} from '../factory.mjs';
import {validTerminationProof} from '../proof.mjs';
import {githubSnapshot} from '../github.mjs';
import {dispatcherInventory} from '../runner-inventory.mjs';
const observeFactory=options=>nativeObserveFactory({census:async()=>({identities:{},owned:{},markedRunIds:[]}),...options});
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
  const marked=await observeFactory({...options(path,'unattended'),census:async()=>({identities:{},owned:{},markedRunIds:[id]})});assert.equal(marked.complete,false);assert.equal(marked.instances.length,1);
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
test('every terminal proof path checks current exact identities and current orphan markers',async t=>{
 const path=await root(t),dir=join(path,'runs',id);await mkdir(dir,{recursive:true});
 await put(join(dir,'run.json'),{id,executor:'codex',cwd:'/repo/example',terminal:true});
 for(const cleanup of [true,undefined]){
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:cleanup,guardianPid:42,guardianIdentity:'exact'});
  const live=await observeFactory({...options(path),lookup:async()=> 'exact'});assert.equal(live.complete,false);assert.equal(live.instances.length,1);
 }
 const unattended=join(path,'unattended',id);await mkdir(unattended,{recursive:true});
 const marked=await observeFactory({...options(path,'unattended'),census:async()=>({identities:{},owned:{},markedRunIds:[id]})});
 assert.equal(marked.complete,false);assert.deepEqual(marked.instances,[]);assert.equal(marked.historyIssues[0].reason,'empty-reservation');
 await assert.rejects(observeFactory({...options(path),census:async()=>{throw Error('unavailable');}}),/unavailable/);
});
test('runner census accounts for declared distinct valid IDs and runs before job budgets',async()=>{
 for(const rows of [[{id:1,status:'online',busy:false,labels:[]}],[{id:1,status:'online',busy:false,labels:[]},{id:1,status:'online',busy:false,labels:[]}]]){
  const read=githubRead();const result=await githubSnapshot(['example/a'],path=>path.includes('/runners')?{total_count:2,runners:rows}:read(path),()=>new Date(at));assert.equal(result.value.censuses[0].runnerComplete,false);
 }
 const calls=[];const result=await githubSnapshot(['example/a','example/b','example/c'],async path=>{calls.push(path);return path.includes('/runners')?{total_count:0,runners:[]}:path.includes('/jobs')?{total_count:0,jobs:[]}:{total_count:5,workflow_runs:Array.from({length:5},(_,i)=>({id:i+1,run_attempt:1}))};},()=>new Date(at),{
  entries:[{organization:'example',runnerId:18,projectIds:['example/a']}],tokenEnv:'ORG_READ',env:{ORG_READ:'synthetic'},fetchImpl:async()=>{calls.push('exact-org');return Response.json({id:18,status:'online',busy:false,labels:[]});}
 });
 assert.deepEqual(calls.slice(0,4),['repos/example/a/actions/runners?per_page=100&page=1','repos/example/b/actions/runners?per_page=100&page=1','repos/example/c/actions/runners?per_page=100&page=1','exact-org']);assert.equal(result.value.orgRunners[0].readable,true);assert.equal(result.value.censuses.every(c=>c.runnerComplete),true);
});
test('canonical census reads process markers once and returns only ownership metadata',async()=>{
 const {execFileSync}=await import('node:child_process');
 const script=fileURLToPath(new URL('../census.py',import.meta.url));
 const fixture=`42 1 42 ${process.getuid()} S Sat Nov 7 08:00:00 2026 tool FACTORY_WORKER_RUN_ID=${id} SECRET=PRIVATE\n`;
 const program=`import runpy\nfrom unittest.mock import patch\nwith patch('subprocess.check_output',return_value=${JSON.stringify(fixture)}):\n runpy.run_path(${JSON.stringify(script)},run_name='__main__')`;
 const stdout=execFileSync('python3',['-B','-c',program],{encoding:'utf8'});const value=JSON.parse(stdout);
 assert.deepEqual(value.markedRunIds,[id]);assert.equal(value.identities['42'],'Sat Nov 7 08:00:00 2026 42 '+process.getuid());assert.equal(stdout.includes('PRIVATE'),false);assert.equal(stdout.includes('SECRET'),false);
});

test('terminal assertions cannot bypass UUID or recorded process identity shape checks',async t=>{
 const path=await root(t),bad='------------------------------------';
 for(const [runId,pid] of [[bad,42],[id,'42']]){
  const dir=join(path,'runs',runId);await mkdir(dir,{recursive:true});await put(join(dir,'run.json'),{id:runId,executor:'codex',cwd:'/repo/example',terminal:true});await put(join(dir,'process.json'),{runId,state:'exited',cleanupVerified:true,guardianPid:pid,guardianIdentity:'exact'});
 }
 const value=await observeFactory(options(path));assert.equal(value.complete,false);assert.deepEqual(value.instances,[]);
});
test('exited cleanup proof cannot hide a current PID without its recorded identity in either channel',async t=>{
 const path=await root(t);
 for(const channel of ['desktop','unattended']){
  const dir=join(path,channel==='desktop'?'runs':'unattended',id);await mkdir(dir,{recursive:true});
  await put(join(dir,channel==='desktop'?'run.json':'admission.json'),channel==='desktop'?{id,executor:'codex',cwd:'/repo/example',terminal:true}:{admissionId:id,binding:{cwd:'/repo/example',gateway:{provider:'codex'},jobId:'example'}});
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:true,guardianPid:42});
  const live=await observeFactory({...options(path,channel),lookup:async()=> 'current'});assert.equal(live.complete,false);assert.deepEqual(live.instances,[]);
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:true,guardianPid:42,guardianIdentity:'malformed'});
  const invalid=await observeFactory({...options(path,channel),lookup:async()=> 'current'});assert.equal(invalid.complete,false);
  const gone=await observeFactory(options(path,channel));assert.equal(gone.complete,true);assert.deepEqual(gone.instances,[]);
  await put(join(dir,'process.json'),{runId:id,state:'exited',cleanupVerified:true,guardianPid:42,guardianIdentity:'Fri Nov 6 22:00:00 2026 42 501'});
  const reused=await observeFactory({...options(path,channel),lookup:async()=> 'different-current-identity'});assert.equal(reused.complete,true);assert.deepEqual(reused.instances,[]);
 }
});
test('ambiguous duplicate server IDs are omitted without erasing a healthy repository census',async()=>{
 const value=await githubSnapshot(['example/a','example/b'],async path=>path.includes('/runners')?{total_count:path.includes('example/a')?2:1,runners:path.includes('example/a')?[{id:18,status:'online',busy:false,labels:[]},{id:18,status:'offline',busy:true,labels:[]}]:[{id:19,status:'online',busy:false,labels:[]}]}:{total_count:0,workflow_runs:[]},()=>new Date(at));
 assert.deepEqual(value.value.runners.map(r=>[r.projectId,r.runnerId]),[['example/b',19]]);assert.equal(value.value.censuses[0].runnerComplete,false);assert.equal(value.value.censuses[1].runnerComplete,true);
 const {snapshot}=await import('../reporter.mjs');const report=await snapshot({hostId:'host-example',sources:[{id:'github',kind:'github'}]},{now:()=>new Date(at),read:async()=>value});assert.equal(report.samples.github.status,'partial');assert.equal(report.samples.github.value.runners[0].runnerId,19);
});
