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
async function invoke(args, prompt = 'fixture') {
  const child = spawn(process.execPath, [cli, ...args], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  child.stdin.end(prompt);
  const [code] = await once(child, 'close');
  assert.equal(stderr, '');
  return { code, output: JSON.parse(stdout) };
}
async function allText(root) {
  let text='';
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const p=join(root,entry.name); text += entry.isDirectory() ? await allText(p) : await readFile(p,'utf8');
  }
  return text;
}
test('lost CLI reply recovers identical measured invocation timing including tool cleanup', async t => {
  const tool = `import signal,time,pathlib,sys
def finish(*args):
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 time.sleep(.4)
 pathlib.Path('tool-cleaned').write_text(str(time.time_ns() // 1000000))
 sys.exit(0)
signal.signal(signal.SIGTERM,finish)
pathlib.Path('tool-ready').write_text('yes')
while True: time.sleep(.01)
`;
  const f = await setup(t, `import subprocess,time,pathlib
subprocess.Popen(['python3','-c',${JSON.stringify(tool)}],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
while not pathlib.Path('tool-ready').exists(): time.sleep(.01)
time.sleep(.3)
` + doneScript);
  const id = randomUUID();
  const args = ['--config', f.configPath, '--admission-id', id];
  const before = Date.now();
  // The caller retains only the ID: it never receives/saves the CLI's stdout.
  const owner = spawn(process.execPath, [cli, ...args], { env: process.env, stdio: ['pipe', 'ignore', 'ignore'] });
  owner.stdin.end('review with a bounded provider/tool wait');
  assert.equal((await once(owner, 'close'))[0], 0);
  const after = Date.now();
  const directory = join(f.state, id);
  const processRecord = await json(join(directory, 'process.json'));
  assert.equal(processRecord.cleanupVerified, true);
  await rm(join(directory, 'result.json')); // Require reconstruction from guardian evidence.
  const recovered = await invoke(['--status', id]);
  assert.equal(recovered.code, 0);
  assert.equal(recovered.output.sessionId, 'session-fixture');
  const timing = recovered.output.timing;
  assert.deepEqual(timing, { source: 'runner', ...processRecord.timing,
    evidence: `Guardian process.json for admission ${id}; monotonic duration includes owned cleanup.` });
  assert.equal(Number.isSafeInteger(timing.durationMs), true);
  assert.ok(timing.durationMs >= 700, `provider wait plus cleanup: ${timing.durationMs}ms`);
  assert.ok(timing.durationMs <= after - before);
  assert.ok(Date.parse(timing.startedAt) >= before);
  assert.ok(Date.parse(timing.endedAt) <= after);
  assert.ok(Date.parse(timing.endedAt) >= Number(await readFile(join(f.cwd, 'tool-cleaned'), 'utf8')));
  assert.deepEqual(await invoke(args), recovered);
  assert.deepEqual(await invoke(['--status', id]), recovered);
});
test('legacy, incomplete and invalid timing never fabricate a reviewer duration', async t => {
  const f = await setup(t);
  const first = await gatewayWorker(f.configPath, 'measured');
  const path = join(f.state, first.admissionId, 'process.json');
  const record = await json(path);
  for (const timing of [undefined, { startedAt: record.timing.startedAt },
    { ...record.timing, durationMs: 0 }, { ...record.timing, durationMs: -1 },
    { ...record.timing, durationMs: 1.5 }, { ...record.timing, endedAt: 'unknown' }]) {
    await writeFile(path, JSON.stringify({ ...record, timing }));
    const status = await workerResult(first.admissionId);
    assert.equal(status.timing, undefined);
    assert.equal(status.result.outcome, 'completed');
  }
  await writeFile(path, JSON.stringify({ ...record, state: 'running' }));
  assert.equal((await workerResult(first.admissionId)).timing, undefined);
  await writeFile(join(f.root, 'bin', 'codex'), '#!/usr/bin/env python3\nimport sys\nsys.stdin.read()\n', { mode: 0o700 });
  await writeFile(path, JSON.stringify(record));
  const noSession = await gatewayWorker(f.configPath, 'no native turn');
  assert.equal(noSession.sessionId, null);
  assert.equal(noSession.terminationVerified, true);
  assert.equal(noSession.timing, undefined);
});
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
  assert.equal((await gatewayWorker(f.configPath,'x')).result.summary,'Gateway credential resolution failed; no fallback');
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
    const refused = await gatewayWorker(f.configPath,'continue',first.admissionId);
    assert.equal(refused.result.outcome,'failed');
    assert.match(refused.result.summary,/same job, checkout and gateway/);
    assert.equal(refused.prelaunchFailure.proof,'never-launched');
    assert.equal(refused.sessionId,null);
  }
});
test('CLI retains a missing-key failure through status/replay and launches only a fresh UUID after restoration', async t => {
  const f = await setup(t, `import pathlib
counter=pathlib.Path('launch-count')
counter.write_text(str(int(counter.read_text())+1) if counter.exists() else '1')
` + doneScript);
  const id = randomUUID();
  const args = ['--config', f.configPath, '--admission-id', id];
  const launches = () => readFile(join(f.cwd, 'launch-count'), 'utf8').catch(e => { if (e.code === 'ENOENT') return '0'; throw e; });
  delete process.env.TEST_GATEWAY_KEY;
  const first = await invoke(args);
  assert.equal(first.code, 1);
  assert.equal(first.output.admissionId, id);
  assert.equal(first.output.sessionId, null);
  assert.equal(first.output.timing, undefined);
  assert.equal(first.output.terminationVerified, true);
  assert.equal(first.output.state, 'failed');
  assert.deepEqual(first.output.prelaunchFailure, { phase: 'preparation', proof: 'never-launched', summary: 'Gateway credential resolution failed; no fallback' });
  assert.deepEqual(first.output.result, { outcome: 'failed', summary: 'Gateway credential resolution failed; no fallback', evidence: [], question: '' });
  assert.deepEqual(await json(first.output.resultPath), first.output);
  assert.deepEqual(await invoke(['--status', id]), first);
  assert.deepEqual(await invoke(args), first);
  process.env.TEST_GATEWAY_KEY = secret;
  assert.deepEqual(await invoke(args), first);
  assert.equal(await launches(), '0');
  const fresh = await invoke(['--config', f.configPath, '--admission-id', randomUUID()]);
  assert.equal(fresh.code, 0);
  assert.equal(fresh.output.result.outcome, 'completed');
  assert.equal(fresh.output.sessionId, 'session-fixture');
  assert.equal(fresh.output.terminationVerified, true);
  const argv = (await json(join(f.cwd, 'observed.json'))).argv;
  assert.equal(argv[0], 'exec');
  assert.equal(argv.includes('resume'), false);
  assert.equal(await launches(), '1');
  await assert.rejects(readFile(join(f.state, id, 'process.json')), { code: 'ENOENT' });
  assert.deepEqual(await invoke(['--status', id]), first);
  assert.doesNotMatch(await allText(f.state), new RegExp(secret));
});
test('known preparation and guardian ENOENT failures are durable without weakening missing/contradictory proof', async t => {
  const f = await setup(t);
  await mkdir(f.state, { recursive: true, mode: 0o700 });
  await writeFile(join(f.state, 'sessions'), 'not a directory');
  const args = ['--config', f.configPath, '--admission-id', randomUUID()];
  const preparation = await invoke(args);
  assert.equal(preparation.code, 1);
  assert.equal(preparation.output.terminationVerified, true);
  assert.equal(preparation.output.sessionId, null);
  assert.deepEqual(preparation.output.prelaunchFailure, { phase: 'preparation', proof: 'never-launched', summary: 'Worker preparation failed; no launch.' });
  assert.deepEqual(await invoke(args), preparation);
  await rm(join(f.state, 'sessions'));
  const path = process.env.PATH;
  process.env.PATH = join(f.root, 'bin'); // No python3 executable; the OS refuses spawn.
  const id = randomUUID();
  const noPython = await invoke(['--config', f.configPath, '--admission-id', id]);
  assert.equal(noPython.code, 1);
  assert.equal(noPython.output.terminationVerified, true);
  assert.equal(noPython.output.sessionId, null);
  assert.equal(noPython.output.timing, undefined);
  assert.deepEqual(noPython.output.prelaunchFailure, { phase: 'guardian-spawn', proof: 'never-launched', summary: 'Guardian executable unavailable; no launch.' });
  process.env.PATH = path;
  assert.deepEqual(await invoke(['--status', id]), noPython);
  assert.deepEqual(await invoke(['--config', f.configPath, '--admission-id', id]), noPython);
  const directory = join(f.state, id);
  await assert.rejects(readFile(join(directory, 'process.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.cwd, 'observed.json')), { code: 'ENOENT' });
  // Missing proof must not be inferred from the retained result or absence of a PID.
  const record = await json(join(directory, 'admission.json'));
  delete record.prelaunchFailure;
  await writeFile(join(directory, 'admission.json'), JSON.stringify(record));
  const unknown = await invoke(['--status', id]);
  assert.equal(unknown.output.terminationVerified, false);
  assert.equal(unknown.output.result.outcome, 'needs_input');
  assert.deepEqual(await invoke(['--config', f.configPath, '--admission-id', id]), unknown);
  record.prelaunchFailure = noPython.output.prelaunchFailure;
  await writeFile(join(directory, 'admission.json'), JSON.stringify(record));
  await writeFile(join(directory, 'process.json'), JSON.stringify({ runId: id, state: 'starting' }));
  assert.equal((await invoke(['--status', id])).output.terminationVerified, false);
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
test('detached reparented descendants are killed before a replacement writer is admitted',async t=>{
  const detached=`import os,signal,time,pathlib
signal.signal(signal.SIGTERM,signal.SIG_IGN)
pathlib.Path('escaped-ready').write_text(str(os.getpid()))
while True:
 pathlib.Path('escaped-heartbeat').write_text(str(time.time_ns()))
 time.sleep(.02)
`;
  const provider=`import sys,subprocess,pathlib,time,json
sys.stdin.read()
p=subprocess.Popen(['python3','-c',${JSON.stringify(detached)}],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
while not pathlib.Path('escaped-ready').exists(): time.sleep(.01)
print(json.dumps({'type':'thread.started','thread_id':'session-detached'}),flush=True)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps({'outcome':'completed','summary':'detached tool started','evidence':[]})}}),flush=True)
print(json.dumps({'type':'turn.completed'}),flush=True)
`;
  const f=await setup(t,provider);
  t.after(async()=>{try{process.kill(Number(await readFile(join(f.cwd,'escaped-ready'),'utf8')),'SIGKILL');}catch{}});
  const first=await gatewayWorker(f.configPath,'first writer');
  const pid=Number(await readFile(join(f.cwd,'escaped-ready'),'utf8'));
  assert.equal(first.terminationVerified,true);
  assert.equal(first.result.outcome,'completed');
  const proc=await json(join(f.state,first.admissionId,'process.json'));
  assert.ok(proc.ownedProcesses.some(p=>p.pid===pid));
  try { process.kill(pid,0); assert.match(await readFile(`/proc/${pid}/stat`,'utf8'),/\) Z /); } catch(e) { if(!['ENOENT','ESRCH'].includes(e.code)) throw e; }
  const heartbeat=await readFile(join(f.cwd,'escaped-heartbeat'),'utf8');
  await writeFile(join(f.root,'bin','codex'),'#!/usr/bin/env python3\n'+doneScript,{mode:0o700});
  const second=await gatewayWorker(f.configPath,'replacement');
  assert.equal(second.result.outcome,'completed');assert.equal(second.terminationVerified,true);
  assert.equal(await readFile(join(f.cwd,'escaped-heartbeat'),'utf8'),heartbeat);
});
test('unreadable descendant census retains admission instead of certifying an empty group',async t=>{
  const f=await setup(t);
  await writeFile(join(f.root,'bin','ps'),'#!/bin/sh\nexit 1\n',{mode:0o700});
  const first=await gatewayWorker(f.configPath,'unknown process ownership');
  assert.equal(first.terminationVerified,false);
  assert.equal(first.result.outcome,'needs_input');
  assert.match((await gatewayWorker(f.configPath,'must hold')).result.summary,/unverified termination/);
});
