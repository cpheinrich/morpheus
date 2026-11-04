import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, readdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { gatewayWorker, readWorkerConfig, workerResult } from '../src/gateway-worker.mjs';
import { key } from '../src/store.mjs';
const cli = fileURLToPath(new URL('../scripts/gateway-worker.mjs', import.meta.url));
const secret = 'secret-gateway-only-123456';
const doneScript = `import sys,json,os,pathlib
prompt=sys.stdin.read()
pathlib.Path('observed.json').write_text(json.dumps({'argv':sys.argv[1:],'prompt':prompt,'env':dict(os.environ)}))
print(json.dumps({'type':'thread.started','thread_id':'session-fixture'}),flush=True)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps({'outcome':'completed','summary':'done','evidence':['fixture'],'question':''})}}),flush=True)
print(json.dumps({'type':'turn.completed'}),flush=True)
`;
async function setup(t, script = doneScript, override = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unattended-worker-')));
  const saved = { PATH: process.env.PATH, FACTORY_HOME: process.env.FACTORY_HOME, TEST_GATEWAY_KEY: process.env.TEST_GATEWAY_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY, CODEX_THREAD_ID: process.env.CODEX_THREAD_ID };
  t.after(async () => { for (const [k,v] of Object.entries(saved)) v === undefined ? delete process.env[k] : process.env[k] = v; await rm(root, { recursive:true, force:true }); });
  const cwd = join(root, 'claimed'); await mkdir(cwd);
  execFileSync('git', ['init','-q',cwd]);
  await mkdir(join(root,'bin'));
  await writeFile(join(root,'bin','codex'), '#!/usr/bin/env python3\n'+script, { mode:0o700 });
  process.env.PATH = `${join(root,'bin')}:${saved.PATH}`;
  process.env.FACTORY_HOME = join(root,'state');
  process.env.TEST_GATEWAY_KEY = secret;
  process.env.OPENAI_API_KEY = 'native-paid-key-must-not-arrive';
  process.env.CODEX_THREAD_ID = 'fake-desktop-must-not-arrive';
  const config = { version:1, jobId:'fixture-service', cwd, gateway:{ name:'fixed',provider:'codex',baseUrl:'https://gateway.invalid',keyRef:'env:TEST_GATEWAY_KEY' }, model:'gpt-6.1-sol',effort:'medium',sandbox:'workspace-write',approvalPolicy:'never',maxRunSeconds:15,maxLogBytes:65536,...override };
  const configPath = join(root,'job.json');
  await writeFile(configPath, JSON.stringify(config), { mode:0o600 });
  return { root,cwd,config,configPath, state:join(root,'state','unattended') };
}
async function waitFor(read, predicate) {
  const deadline = Date.now()+15000;
  let value;
  while (Date.now()<deadline) { value = await read().catch(()=>null); if(predicate(value)) return value; await new Promise(r=>setTimeout(r,40)); }
  assert.fail(`Timed out waiting for fixture evidence: ${JSON.stringify(value)}`);
}
async function json(path) { return JSON.parse(await readFile(path,'utf8')); }
async function allText(root) {
  let text='';
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const p=join(root,entry.name); text += entry.isDirectory() ? await allText(p) : await readFile(p,'utf8');
  }
  return text;
}
test('gateway-only launch pins args/env, stdin, exact permissions, and correlated continuation', async t => {
  const f = await setup(t);
  const result = await gatewayWorker(f.configPath,'make the reversible change');
  assert.equal(result.result.outcome,'completed');
  assert.equal(result.binding.jobId,'fixture-service');
  assert.equal(result.terminationVerified,true);
  assert.equal(result.sessionId,'session-fixture');
  const observed=await json(join(f.cwd,'observed.json'));
  assert.match(observed.prompt,/make the reversible change/);
  assert.equal(observed.argv.at(-1),'-');
  assert.equal(observed.argv.includes('make the reversible change'),false);
  for(const arg of ['model_provider="OpenAI"','model_providers.OpenAI.base_url="https://gateway.invalid/v1"','sandbox_mode="workspace-write"','approval_policy="never"','model_reasoning_effort="medium"']) assert.ok(observed.argv.includes(arg),arg);
  assert.equal(observed.env.OPENAI_API_KEY,secret);
  assert.equal(observed.env.TEST_GATEWAY_KEY,undefined);
  assert.equal(observed.env.CODEX_THREAD_ID,undefined);
  assert.equal(observed.env.FACTORY_DELEGATED,'1');
  assert.equal(observed.env.CODEX_HOME.startsWith(f.state),true);
  assert.doesNotMatch(await allText(f.state),new RegExp(secret));
  const second=await gatewayWorker(f.configPath,'continue',result.admissionId);
  assert.equal(second.sessionId,'session-fixture');
  assert.deepEqual((await json(join(f.cwd,'observed.json'))).argv.slice(0,2),['exec','resume']);
  assert.ok((await json(join(f.cwd,'observed.json'))).argv.includes('session-fixture'));
});
test('missing key and invalid provider/permissions/config never run a native fallback', async t => {
  const f=await setup(t);
  delete process.env.TEST_GATEWAY_KEY;
  await assert.rejects(gatewayWorker(f.configPath,'x'),/credential resolution failed/);
  await assert.rejects(readFile(join(f.cwd,'observed.json')),{code:'ENOENT'});
  for(const change of [{gateway:{...f.config.gateway,provider:'claude'}},{approvalPolicy:'on-request'},{sandbox:'unknown'},{model:'auto'},{maxRunSeconds:0},{gateway:{...f.config.gateway,baseUrl:'https://user:password@gateway.invalid'}}]) {
    await writeFile(f.configPath,JSON.stringify({...f.config,...change}));
    await assert.rejects(gatewayWorker(f.configPath,'x'),/Invalid unattended|Gateway URL/);
  }
  await writeFile(f.configPath,JSON.stringify(f.config));
  await assert.rejects(gatewayWorker(f.configPath,''),/Prompt must/);
  await assert.rejects(gatewayWorker(f.configPath,'x'.repeat(1048577)),/Prompt must/);
});
test('private configuration must be outside a workspace and owner-only',async t=>{
  const f=await setup(t);
  const internal=join(f.cwd,'config.json'); await writeFile(internal,JSON.stringify(f.config),{mode:0o600});
  await assert.rejects(readWorkerConfig(internal),/outside workspaces/);
  const publicFile=join(f.root,'public.json'); await writeFile(publicFile,JSON.stringify(f.config),{mode:0o644}); await chmod(publicFile,0o644);
  await assert.rejects(readWorkerConfig(publicFile),/owner-only/);
});
test('continuation refuses changed job, workspace, gateway, model or permission binding',async t=>{
  const f=await setup(t); const first=await gatewayWorker(f.configPath,'start');
  const other=join(f.root,'other'); await mkdir(other);
  for(const change of [{jobId:'another-job'},{cwd:other},{gateway:{...f.config.gateway,baseUrl:'https://other.invalid'}},{model:'other-model'},{sandbox:'danger-full-access'}]) {
    await writeFile(f.configPath,JSON.stringify({...f.config,...change}));
    await assert.rejects(gatewayWorker(f.configPath,'continue',first.admissionId),/same job, checkout and gateway/);
  }
});
test('a CLI worker reports gateway failure without invoking native login or changing route',async t=>{
  const f=await setup(t,"import sys,pathlib\npathlib.Path('invoked').write_text(' '.join(sys.argv[1:]))\nsys.stdin.read()\nprint('{\"type\":\"turn.failed\",\"error\":{\"message\":\"gateway unavailable\"}}',flush=True)\nsys.exit(23)\n");
  const child=spawn(process.execPath,[cli,'--config',f.configPath],{env:process.env,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr=''; child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.end('repair');
  const [code]=await once(child,'close');
  assert.equal(code,1); assert.equal(stderr,'');
  const result=JSON.parse(stdout); assert.equal(result.result.outcome,'failed');assert.equal(result.exitCode,23);
  assert.equal(result.result.summary,'gateway unavailable');
  assert.match(await readFile(join(f.cwd,'invoked'),'utf8'),/^exec /);
});
test('one guardian admits one writer across jobs in a canonical workspace',async t=>{
  const f=await setup(t,"import pathlib,time,sys\npathlib.Path('started').write_text('yes')\nsys.stdin.read()\ntime.sleep(2)\n");
  const first=gatewayWorker(f.configPath,'first');
  await waitFor(()=>readFile(join(f.cwd,'started'),'utf8'),v=>v==='yes');
  const other=join(f.root,'other-job.json');await writeFile(other,JSON.stringify({...f.config,jobId:'other-job'}),{mode:0o600});
  const blocked=await gatewayWorker(other,'second');
  assert.equal(blocked.result.outcome,'needs_input');assert.match(blocked.result.summary,/active guardian/);
  assert.equal((await first).terminationVerified,true);
});
test('output redaction spans read boundaries in both logs and structured results',async t=>{
  const f=await setup(t,`import os,sys,time,json
sys.stdin.read()
k=os.environ['OPENAI_API_KEY']
for stream in [sys.stdout,sys.stderr]:
 stream.write(k[:8]);stream.flush();time.sleep(.25);stream.write(k[8:]+'\\n');stream.flush()
print(json.dumps({'type':'thread.started','thread_id':'session-redacted'}),flush=True)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps({'outcome':'completed','summary':k,'evidence':[k]})}}),flush=True)
print(json.dumps({'type':'turn.completed'}),flush=True)
`);
  const result=await gatewayWorker(f.configPath,'safe');
  assert.equal(result.result.summary,'[REDACTED]');
  assert.deepEqual(result.result.evidence,['[REDACTED]']);
  assert.doesNotMatch(await allText(f.state),new RegExp(secret));
  assert.match(await readFile(join(f.state,result.admissionId,'stderr.log'),'utf8'),/\[REDACTED\]/);
});
test('deadline checkpoints the native session and kills owned descendants before readmission',async t=>{
  const f=await setup(t,`import sys,json,subprocess,time,pathlib
sys.stdin.read()
p=subprocess.Popen(['python3','-c','import time;time.sleep(90)'])
pathlib.Path('descendant').write_text(str(p.pid))
print(json.dumps({'type':'thread.started','thread_id':'session-deadline'}),flush=True)
time.sleep(90)
`,{maxRunSeconds:1});
  const result=await gatewayWorker(f.configPath,'repair');
  assert.equal(result.result.outcome,'needs_input');assert.equal(result.result.summary,'Run deadline reached');
  assert.equal(result.sessionId,'session-deadline');assert.equal(result.terminationVerified,true);
  const pid=Number(await readFile(join(f.cwd,'descendant'),'utf8'));
  try { process.kill(pid,0); assert.match(await readFile(`/proc/${pid}/stat`,'utf8'),/\) Z /); } catch(e) { if(!['ENOENT','ESRCH'].includes(e.code)) throw e; }
  assert.deepEqual(await workerResult(result.admissionId),result);
});
test('unknown prior termination retains admission even after process death or corrupted state',async t=>{
  const f=await setup(t);
  await mkdir(f.state,{recursive:true,mode:0o700});
  const prior=join(f.state,'prior');await mkdir(prior);
  await writeFile(join(prior,'process.json'),JSON.stringify({runId:'prior',state:'running',guardianPid:99999999}));
  await writeFile(join(f.state,key(f.cwd)+'.json'),JSON.stringify({runId:'prior',directory:prior}));
  const result=await gatewayWorker(f.configPath,'do not duplicate');
  assert.equal(result.result.outcome,'needs_input');assert.match(result.result.summary,/unverified termination/);
  await assert.rejects(readFile(join(f.cwd,'observed.json')),{code:'ENOENT'});
  await writeFile(join(prior,'process.json'),'broken');
  assert.match((await gatewayWorker(f.configPath,'still no')).result.summary,/unverified termination/);
});
test('service death expires its own guardian lease; restart reconstructs checkpoint without desktop metadata',async t=>{
  const f=await setup(t,`import sys,time,json,pathlib
sys.stdin.read()
print(json.dumps({'type':'thread.started','thread_id':'session-crash'}),flush=True)
pathlib.Path('started').write_text('yes')
time.sleep(90)
`);
  const admissionId=randomUUID();
  await writeFile(join(f.root,'consumer-checkpoint.json'),JSON.stringify({admissionId}),{mode:0o600});
  const owner=spawn(process.execPath,[cli,'--config',f.configPath,'--admission-id',admissionId],{env:process.env,stdio:['pipe','ignore','ignore']});owner.stdin.end('start');
  t.after(()=>{try{owner.kill('SIGKILL');}catch{}});
  await waitFor(()=>readFile(join(f.cwd,'started'),'utf8'),v=>v==='yes');
  const pointer={runId:admissionId,directory:join(f.state,admissionId)};
  assert.equal((await workerResult(admissionId)).terminationVerified,false);
  const duplicate=await gatewayWorker(f.configPath,'same operation retry',null,admissionId);
  assert.equal(duplicate.admissionId,admissionId);
  assert.equal(duplicate.terminationVerified,false);
  owner.kill('SIGKILL'); await once(owner,'close');
  const terminal=await waitFor(()=>json(join(pointer.directory,'process.json')),v=>v?.state==='exited');
  assert.equal(terminal.reason,'Owner lease expired');assert.equal(terminal.cleanupVerified,true);
  const status=spawn(process.execPath,[cli,'--status',admissionId],{env:process.env,stdio:['ignore','pipe','pipe']});
  let output='';status.stdout.on('data',b=>output+=b);
  assert.equal((await once(status,'close'))[0],0);
  const recovered=JSON.parse(output);
  const retried=await gatewayWorker(f.configPath,'do not relaunch',null,admissionId);
  assert.deepEqual(retried,recovered);
  assert.equal(recovered.sessionId,'session-crash');assert.equal(recovered.terminationVerified,true);
  await writeFile(join(f.root,'bin','codex'),'#!/usr/bin/env python3\n'+doneScript,{mode:0o700});
  const continuationId=randomUUID();
  const continuation=spawn(process.execPath,[cli,'--config',f.configPath,'--admission-id',continuationId,'--resume',admissionId],{env:process.env,stdio:['pipe','pipe','pipe']});
  let continuedOutput='';continuation.stdout.on('data',b=>continuedOutput+=b);continuation.stdin.end('resume after service restart');
  assert.equal((await once(continuation,'close'))[0],0);
  const resumed=JSON.parse(continuedOutput);
  assert.equal(resumed.admissionId,continuationId);
  assert.equal(resumed.result.outcome,'completed');
  assert.ok((await json(join(f.cwd,'observed.json'))).argv.includes('session-crash'));
});
test('output bound returns a resumable checkpoint and bounded durable logs',async t=>{
  const f=await setup(t,"import sys,time\nsys.stdin.read()\nprint('{\"type\":\"thread.started\",\"thread_id\":\"session-cap\"}',flush=True)\ntime.sleep(.1)\nwhile True:\n print('x'*100,flush=True)\n time.sleep(.02)\n",{maxLogBytes:256});
  const result=await gatewayWorker(f.configPath,'bounded');
  assert.equal(result.result.summary,'Output limit reached');assert.equal(result.sessionId,'session-cap');assert.equal(result.terminationVerified,true);
  assert.ok((await readFile(join(f.state,result.admissionId,'events.jsonl'))).length<=256);
});
test('a killed guardian cannot turn its unknown surviving worker into a new admission',async t=>{
  const f=await setup(t,"import sys,time,pathlib\nsys.stdin.read()\npathlib.Path('started').write_text('yes')\ntime.sleep(90)\n");
  const invocation=gatewayWorker(f.configPath,'first');
  await waitFor(()=>readFile(join(f.cwd,'started'),'utf8'),v=>v==='yes');
  const pointer=await json(join(f.state,key(f.cwd)+'.json'));
  const proc=await json(join(pointer.directory,'process.json'));
  t.after(()=>{try{process.kill(-proc.claudePid,'SIGKILL');}catch{}});
  process.kill(proc.guardianPid,'SIGKILL');
  const unknown=await invocation;
  assert.equal(unknown.terminationVerified,false);assert.equal(unknown.sessionId,null);
  const replacement=await gatewayWorker(f.configPath,'do not duplicate');
  assert.match(replacement.result.summary,/unverified termination/);
  assert.equal(replacement.result.outcome,'needs_input');
  assert.doesNotThrow(()=>process.kill(proc.claudePid,0));
});

test('reserved provider key reference is preserved without persisting the key',async t=>{
  const f=await setup(t);
  process.env.OPENAI_API_KEY=secret;
  await writeFile(f.configPath,JSON.stringify({...f.config,gateway:{...f.config.gateway,keyRef:'env:OPENAI_API_KEY'}}));
  const result=await gatewayWorker(f.configPath,'reserved variable');
  assert.equal(result.result.outcome,'completed');
  assert.equal((await json(join(f.cwd,'observed.json'))).env.OPENAI_API_KEY,secret);
  assert.doesNotMatch(await allText(f.state),new RegExp(secret));
});
test('caller admission ID is exclusive, binding checked and never reused to launch twice',async t=>{
  const f=await setup(t);
  const id=randomUUID();
  const first=await gatewayWorker(f.configPath,'first',null,id);
  await rm(join(f.cwd,'observed.json'));
  assert.deepEqual(await gatewayWorker(f.configPath,'retry',null,id),first);
  await assert.rejects(readFile(join(f.cwd,'observed.json')),{code:'ENOENT'});
  await writeFile(f.configPath,JSON.stringify({...f.config,jobId:'other'}));
  await assert.rejects(gatewayWorker(f.configPath,'wrong binding',null,id),/different job binding/);
  await assert.rejects(gatewayWorker(f.configPath,'invalid',null,'../escape'),/Invalid admission UUID/);
});
test('a crash between directory reservation and evidence publication refuses same-ID replay',async t=>{
  const f=await setup(t);const id=randomUUID();
  await mkdir(join(f.state,id),{recursive:true,mode:0o700});
  await assert.rejects(gatewayWorker(f.configPath,'no replay',null,id),/Unknown admission ID/);
  await assert.rejects(readFile(join(f.cwd,'observed.json')),{code:'ENOENT'});
});
