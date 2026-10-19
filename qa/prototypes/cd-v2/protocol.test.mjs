import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

// Protocol prototype only: none of these model functions are production adapters.
const HOUR = 3600_000, SLOT = 6 * HOUR;
const clone = x => structuredClone(x);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'CD protocol probe', GIT_AUTHOR_EMAIL: 'probe@example.invalid', GIT_COMMITTER_NAME: 'CD protocol probe', GIT_COMMITTER_EMAIL: 'probe@example.invalid' };
function git(cwd, ...args) { return execFileSync('git', args, {cwd, env: gitEnv, encoding: 'utf8', stdio: ['pipe','pipe','pipe']}).trim(); }
function gitAsync(cwd, ...args) { return new Promise(resolve => { const p = spawn('git', args, {cwd, env: gitEnv}); let output=''; p.stdout.on('data', x=>output+=x); p.stderr.on('data', x=>output+=x); p.on('close', code=>resolve({code, output})); }); }
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'cd-v2-git-')), remote=join(root,'state.git'), local=join(root,'writer');
  git(root,'init','--bare',remote); git(root,'init',local); git(local,'remote','add','origin',remote);
  const tree=git(local,'mktree'); const base=git(local,'commit-tree',tree,'-m','initial');
  git(local,'push','origin',`${base}:refs/heads/state`);
  const commit = (parent, message) => git(local,'commit-tree',tree,'-p',parent,'-m',message);
  return {root,remote,local,base,commit,close(){rmSync(root,{recursive:true,force:true});}};
}

test('REAL GIT: eight concurrent exact-parent siblings admit exactly one nonforce writer', async () => {
  const f=fixture(); try {
    const candidates=Array.from({length:8},(_,i)=>f.commit(f.base,`writer-${i}`));
    const results=await Promise.all(candidates.map(c=>gitAsync(f.local,'push','origin',`${c}:refs/heads/state`)));
    assert.equal(results.filter(r=>r.code===0).length,1);
    const head=git(f.remote,'rev-parse','refs/heads/state');
    assert.equal(head,candidates[results.findIndex(r=>r.code===0)]);
    assert.equal(git(f.remote,'rev-list','--count','refs/heads/state'),'2');
    console.log(`real Git siblings: accepted=1 rejected=7 head=${head}`);
  } finally {f.close();}
});

test('REAL GIT: rejected sibling reloads and reapplies on winning head', async () => {
  const f=fixture(); try {
    const a=f.commit(f.base,'effect-a'),b=f.commit(f.base,'effect-b');
    git(f.local,'push','origin',`${a}:refs/heads/state`);
    assert.notEqual((await gitAsync(f.local,'push','origin',`${b}:refs/heads/state`)).code,0);
    const reloaded=git(f.remote,'rev-parse','refs/heads/state');
    const retry=f.commit(reloaded,'effect-b recomputed'); git(f.local,'push','origin',`${retry}:refs/heads/state`);
    assert.equal(git(f.remote,'rev-list','--count','refs/heads/state'),'3');
  } finally {f.close();}
});

test('REAL GIT: lost accepted-push acknowledgment resolves by readback without duplicate event', async () => {
  const f=fixture(); try {
    const effect='dispatch-immutable-id'; const accepted=f.commit(f.base,`event:${effect}`);
    // The remote succeeds; deliberately discard all response data as a response-loss fault.
    await gitAsync(f.local,'push','origin',`${accepted}:refs/heads/state`);
    const observed=git(f.remote,'rev-parse','refs/heads/state');
    assert.equal(observed,accepted);
    const persisted=git(f.remote,'log','--format=%s','refs/heads/state');
    assert.equal(persisted.split('\n').filter(x=>x===`event:${effect}`).length,1);
    // Git accepts a same-object retry as a no-op; no second commit/event is generated.
    git(f.local,'push','origin',`${accepted}:refs/heads/state`);
    assert.equal(git(f.remote,'rev-list','--count','refs/heads/state'),'2');
  } finally {f.close();}
});

test('REAL GIT: nonforce is fast-forward protection, not arbitrary expected-head compare-and-swap', () => {
  const f=fixture(); try {
    const intermediate=f.commit(f.base,'unobserved update'),descendant=f.commit(intermediate,'new state');
    // A descendant of an unobserved head succeeds. Adapter must create exactly one commit
    // on the exact observed parent, and never merge/fetch/rebase inside the push itself.
    git(f.local,'push','origin',`${intermediate}:refs/heads/state`);
    git(f.local,'push','origin',`${descendant}:refs/heads/state`);
    assert.equal(git(f.remote,'rev-parse','refs/heads/state'),descendant);
  } finally {f.close();}
});

function slots(last,now) { const result=[]; for(let x=last+SLOT;x<=Math.floor(now/SLOT)*SLOT;x+=SLOT) result.push(x); return result; }
function coalesce(intent,source,newDebt,slot) {
  return {...clone(intent),currentSource:source,oldestDebt:Math.min(intent.oldestDebt,newDebt),lineage:[...intent.lineage,source],coalescedSlots:[...intent.coalescedSlots,slot]};
}
function sourceEligible(source,slot) { return Number.isFinite(source.firstMainAt) && source.firstMainAt<=slot-24*HOUR; }
function selectProduction(history,slot) { return history.findLast(s=>sourceEligible(s,slot)); }

test('MODEL: dropped ticks enumerate all four elapsed six-hour boundaries',()=>{
  assert.deepEqual(slots(0,26*HOUR),[6,12,18,24].map(x=>x*HOUR));
  assert.deepEqual(slots(24*HOUR,26*HOUR),[]);
});
test('MODEL: failure plus continuous merges preserves original slot/source, old debt and failed attempt',()=>{
  const initial={id:'delivery-1',slot:6*HOUR,originalSource:'A',currentSource:'A',oldestDebt:HOUR,lineage:['A'],attempts:[{id:'a1',failed:true}],coalescedSlots:[]};
  let next=initial; for(let h=12;h<=48;h+=6)next=coalesce(next,`source-${h}`,h*HOUR,h*HOUR);
  assert.equal(next.oldestDebt,HOUR); assert.equal(next.slot,6*HOUR);assert.equal(next.originalSource,'A');assert.equal(next.attempts.length,1);assert.equal(next.lineage.length,8);
});
test('MODEL: each no-change missed slot persists a decision but adds zero successful deliveries',()=>{
  const decisions=slots(0,25*HOUR).map(slot=>({slot,kind:'no-change'}));
  assert.equal(decisions.length,4);assert.equal(decisions.filter(x=>x.kind==='delivered').length,0);
});
test('MODEL: stale delivered source clears only debt included in its ancestry',()=>{
  const debt=[{sha:'A',at:HOUR},{sha:'B',at:7*HOUR},{sha:'C',at:13*HOUR}];
  const included=new Set(['A']);const remaining=debt.filter(d=>!included.has(d.sha));
  assert.deepEqual(remaining.map(d=>d.sha),['B','C']);assert.equal(Math.min(...remaining.map(d=>d.at)),7*HOUR);
});
test('MODEL: production first-main age is inclusive at exactly 24h',()=>{
  const source={firstMainAt:10*HOUR,authorAt:-1000*HOUR};
  assert.equal(sourceEligible(source,34*HOUR-1),false);assert.equal(sourceEligible(source,34*HOUR),true);
});
test('MODEL: old author date and missing/unknown main evidence cannot establish age',()=>{
  assert.equal(sourceEligible({authorAt:-1000*HOUR},30*HOUR),false);
  assert.equal(sourceEligible({firstMainAt:29*HOUR,authorAt:-1000*HOUR},30*HOUR),false);
});
test('MODEL: newest eligible first-parent revision wins even with misleading author ordering',()=>{
  const history=[{sha:'A',firstMainAt:0,authorAt:100*HOUR},{sha:'B',firstMainAt:2*HOUR,authorAt:-100*HOUR},{sha:'C',firstMainAt:25*HOUR,authorAt:-200*HOUR}];
  assert.equal(selectProduction(history,26*HOUR).sha,'B');
});
test('MODEL: production app repair restarts main age; controller-only repair requires unchanged dependency/config digest',()=>{
  const slot=50*HOUR,original={firstMainAt:0,digest:'app-config-A'};
  assert.equal(sourceEligible({...original,firstMainAt:49*HOUR},slot),false);
  const controllerOnly={...original,controller:'control-2'};assert.equal(sourceEligible(controllerOnly,slot)&&controllerOnly.digest===original.digest,true);
  assert.equal(sourceEligible({...original,digest:'changed'},slot)&&'changed'===original.digest,false);
});

const identity={delivery:'d1',effect:'e1',app:'app-staging',version:'1.2',build:201,source:'sha-A',ipaHash:'sha256-ipa',run:'r1',attempt:1};
function receiptValid(r,expected) {
  return Object.keys(expected).every(k=>r[k]===expected[k]) && r.processing==='VALID' && r.groupId==='internal-team' && r.groupApp===expected.app && r.groupType==='INTERNAL' && r.groupMembership===true && r.betaInstallable===true;
}
function finalReceipt(state,receipt,expected) {
  if (!receiptValid(receipt,expected))throw Error('invalid receipt');
  const digest=hash(receipt); if(state.receiptHash && state.receiptHash!==digest)throw Error('immutable receipt');
  return {...state,receipt:clone(receipt),receiptHash:digest,cursor:expected.source,status:'delivered'};
}
const goodReceipt=()=>({...identity,processing:'VALID',groupId:'internal-team',groupApp:identity.app,groupType:'INTERNAL',groupMembership:true,betaInstallable:true});
test('MODEL: exact internal receipt persists before source cursor advances',()=>{
  const supplied=goodReceipt();const delivered=finalReceipt({cursor:null},supplied,identity);supplied.source='tampered';
  assert.equal(delivered.receipt.source,'sha-A');assert.equal(delivered.cursor,'sha-A');assert.equal(delivered.receiptHash,hash(delivered.receipt));
});
test('MODEL: wrong delivery/source/app/build/effect/run/attempt/hash/version fails without cursor movement',()=>{
  for(const key of Object.keys(identity)) {
    const state={cursor:'old'};const receipt=goodReceipt();receipt[key]=`wrong-${key}`;
    assert.throws(()=>finalReceipt(state,receipt,identity),/invalid receipt/);assert.equal(state.cursor,'old');
  }
});
test('MODEL: receipt rejects external group, wrong app group, noninstallable or unprocessed build',()=>{
  for(const override of [{groupType:'EXTERNAL'},{groupApp:'other-app'},{groupMembership:false},{processing:'PROCESSING'},{betaInstallable:false}])assert.equal(receiptValid({...goodReceipt(),...override},identity),false);
});
test('MODEL: terminal receipt cannot be silently replaced by later readback',()=>{
  const receipt=goodReceipt(),state=finalReceipt({},receipt,identity);
  assert.deepEqual(finalReceipt(state,receipt,identity),state);
  assert.throws(()=>finalReceipt(state,{...receipt,observedAt:'later'},identity),/immutable receipt/);
});

function lease(owner,now,fence=1){return {owner,expires:now+100,fence};}
function claim(state,op,who,now){
  if(state.lease.owner!==who.owner||state.lease.fence!==who.fence||state.lease.expires<=now)throw Error('stale lease');
  if(state.operations[op])throw Error('already reserved');
  return {...state,operations:{...state.operations,[op]:{owner:who.owner,fence:who.fence,status:'reserved'}}};
}
function takeover(state,owner,now){if(state.lease.expires>now)throw Error('live lease');return {...state,lease:lease(owner,now,state.lease.fence+1)};}
test('MODEL: stale owner cannot acquire effects after expiration/takeover',()=>{
  const initial={lease:lease('A',0),operations:{}};const fresh=takeover(initial,'B',101);
  assert.throws(()=>claim(fresh,'upload-1',initial.lease,102),/stale lease/);
  assert.throws(()=>claim(initial,'upload-1',initial.lease,100),/stale lease/);
  assert.equal(fresh.lease.fence,2);
});
test('MODEL: uncertain active upload survives lease expiration and blocks replacement uploader',()=>{
  let state={lease:lease('A',0),operations:{}};state=claim(state,'app/version/201',state.lease,1);
  state.operations['app/version/201'].status='uncertain';state=takeover(state,'B',101);
  assert.throws(()=>claim(state,'app/version/201',state.lease,102),/already reserved/);
  assert.equal(state.operations['app/version/201'].fence,1);
});
test('MODEL: exact provider readback after lost upload response resumes distribution without new upload',()=>{
  const state={identity:clone(identity),status:'uncertain',uploadCalls:1};
  const providerBuilds=[{...identity,build:200,id:'sibling'},{...identity,id:'accepted-201'}];
  const found=providerBuilds.find(b=>Object.keys(identity).every(k=>b[k]===identity[k]));
  const resumed={...state,status:found?'processing':'uncertain',providerId:found?.id};
  assert.equal(resumed.providerId,'accepted-201');assert.equal(resumed.uploadCalls,1);
});
test('MODEL: absent provider build before observation deadline does not prove upload rejection',()=>{
  const startedAt=0,deadline=1000;const reads=[];const now=900;
  const status=reads.length?'processing':now<deadline?'uncertain':'recovery-decision-required';
  assert.equal(status,'uncertain');
});

test('MODEL: dispatch crash windows maintain durable intent and stable effect identity',()=>{
  let ledger={intents:[],effects:{}};let calls=0;
  const transition=()=>({...ledger,intents:[{id:'d1'}],effects:{e1:{status:'planned',delivery:'d1'}}});
  const discarded=transition();assert.equal(calls,0);assert.equal(ledger.effects.e1,undefined);
  ledger=transition();assert.ok(ledger.effects.e1);assert.equal(calls,0);
  const runs=[];function dispatch(){calls++;runs.push({effect:'e1',run:'r1'});}dispatch();
  // Lose response, crash before persisting run ID, then resume by effect enumeration.
  const existing=runs.filter(r=>r.effect==='e1');if(existing.length===0)dispatch();
  assert.equal(calls,1);assert.equal(existing[0].run,'r1');assert.equal(discarded.intents[0].id,'d1');
});
test('MODEL: concurrent duplicate dispatched jobs share one durable upload claim',()=>{
  let state={lease:lease('worker',0),operations:{}};state=claim(state,'upload/e1',state.lease,1);
  assert.throws(()=>claim(state,'upload/e1',state.lease,2),/already reserved/);
});

function reserve(state,id,maximum){
  if(state.reservations[id]){if(state.reservations[id].maximum!==maximum)throw Error('reservation identity changed');return clone(state);}
  if(state.settlements?.[id])throw Error('settled request cannot be reserved again');
  const pending=Object.values(state.reservations).reduce((n,r)=>n+r.maximum,0);
  if(state.spent+pending+maximum>state.ceiling)throw Error('budget pause');
  return {...state,reservations:{...state.reservations,[id]:{maximum}}};
}
function settle(state,id,actual){
  if(state.settlements?.[id]){if(state.settlements[id].actual!==actual)throw Error('settlement identity changed');return clone(state);}
  const r=state.reservations[id];if(!r)throw Error('missing reservation');if(actual>r.maximum)throw Error('provider cap violation');
  const reservations={...state.reservations};delete reservations[id];return {...state,spent:state.spent+actual,reservations,settlements:{...state.settlements,[id]:{actual}}};
}
test('MODEL: quota reserves worst-case use and keeps 10% subscription capacity',()=>{
  let s={ceiling:900,spent:800,reservations:{}};s=reserve(s,'r1',60);
  assert.throws(()=>reserve(s,'r2',50),/budget pause/);assert.equal(reserve(s,'r2',40).reservations.r2.maximum,40);
});
test('MODEL: monetary requests reserve concurrently against $250 task cap',()=>{
  let s={ceiling:25000,spent:24000,reservations:{}};s=reserve(s,'request-1',700);
  assert.throws(()=>reserve(s,'request-2',400),/budget pause/);s=reserve(s,'request-2',300);
  assert.equal(s.spent+Object.values(s.reservations).reduce((n,r)=>n+r.maximum,0),25000);
});
test('MODEL: lost provider acknowledgment retains maximum reservation; retry same ID does not double reserve',()=>{
  let s={ceiling:25000,spent:0,reservations:{}};s=reserve(s,'request-1',1000);assert.deepEqual(reserve(s,'request-1',1000),s);
  assert.equal(s.reservations['request-1'].maximum,1000);s=settle(s,'request-1',600);assert.equal(s.spent,600);assert.equal(Object.keys(s.reservations).length,0);
});
test('MODEL: a new retry request requires a new reservation until old uncertain consumption resolves',()=>{
  const s=reserve({ceiling:1000,spent:0,reservations:{}},'old',700);
  assert.throws(()=>reserve(s,'retry-new-request',700),/budget pause/);
});
test('MODEL: build reservations remain globally unique and uncertain identities are never reused',()=>{
  let next=200;const reservations=new Set();const allocate=providerMax=>{next=Math.max(next,providerMax)+1;const identity=`app/version/${next}`;assert.equal(reservations.has(identity),false);reservations.add(identity);return identity;};
  assert.equal(allocate(205),'app/version/206');assert.equal(allocate(204),'app/version/207');
  // Uncertain 206 remains reserved even though later provider readback only reports 204.
  assert.equal(reservations.has('app/version/206'),true);
});


test('REAL GIT: backdated author/committer dates cannot establish first arrival on main',()=>{
  const f=fixture();try{
    const tree=git(f.local,'mktree');
    const sha=execFileSync('git',['commit-tree',tree,'-p',f.base,'-m','backdated source'],{cwd:f.local,env:{...gitEnv,GIT_AUTHOR_DATE:'2000-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2000-01-01T00:00:00Z'},encoding:'utf8'}).trim();
    git(f.local,'push','origin',`${sha}:refs/heads/main`);
    const observedMainAt=Date.now();const authorAt=Number(git(f.local,'show','-s','--format=%at',sha))*1000;
    assert.ok(observedMainAt-authorAt>24*HOUR);
    assert.equal(sourceEligible({authorAt,firstMainAt:observedMainAt},observedMainAt),false);
  }finally{f.close();}
});
test('MODEL: reservation request mutation and repeated settlement cannot spend twice',()=>{
  const before=reserve({ceiling:1000,spent:0,reservations:{}},'request',500);
  assert.throws(()=>reserve(before,'request',501),/reservation identity changed/);
  const after=settle(before,'request',300);assert.deepEqual(settle(after,'request',300),after);
  assert.equal(after.spent,300);assert.throws(()=>reserve(after,'request',500),/settled request/);
  assert.throws(()=>settle(after,'request',301),/settlement identity changed/);
});
test('COUNTEREXAMPLE: refreshing debt from the newest merge hides a delivery stalled for 30 hours',()=>{
  const now=31*HOUR,oldestDebt=HOUR,newestMerge=30*HOUR;
  assert.equal(now-newestMerge>SLOT,false); // Naive watchdog falsely reports fresh.
  assert.equal(now-oldestDebt>SLOT,true);   // Outstanding debt still overdue.
});
test('COUNTEREXAMPLE: lease expiry alone cannot authorize a second Apple upload',()=>{
  const effects=[];const upload=owner=>effects.push({owner,build:201});
  upload('old worker after its last successful lease check');upload('new worker relying only on expiry');
  assert.equal(effects.length,2);assert.equal(new Set(effects.map(x=>x.build)).size,1);
  // A fence in GitHub cannot revoke a request already entering Apple. The operation
  // reservation must be nonexpiring until provider reconciliation, unlike worker lease.
});
test('COUNTEREXAMPLE: request timeout is not proof of free quota',()=>{
  const actualCost=700,ceiling=1000;
  const naiveFreedOnTimeout=0;assert.ok(naiveFreedOnTimeout+700<=ceiling);
  assert.ok(actualCost+700>ceiling); // Unsafe new retry exceeds capacity if old request ran.
});

test('REAL GIT: lost accepted acknowledgment remains discoverable after another writer advances head',()=>{
  const f=fixture();try{
    const accepted=f.commit(f.base,'event:effect-A');git(f.local,'push','origin',`${accepted}:refs/heads/state`);
    const subsequent=f.commit(accepted,'event:effect-B');git(f.local,'push','origin',`${subsequent}:refs/heads/state`);
    const current=git(f.remote,'rev-parse','refs/heads/state');assert.notEqual(current,accepted);
    const history=git(f.remote,'log','--format=%s','refs/heads/state').split('\n');
    assert.equal(history.filter(x=>x==='event:effect-A').length,1);
    assert.equal(git(f.remote,'merge-base','--is-ancestor',accepted,current),'');
    assert.equal(git(f.remote,'rev-list','--count','refs/heads/state'),'3');
  }finally{f.close();}
});
test('MODEL: coalesced production catch-up uses latest due slot age cutoff, not reconciliation wall-clock',()=>{
  const history=[{sha:'A',firstMainAt:0},{sha:'B',firstMainAt:36*HOUR}];
  const latestDueSlot=57*HOUR,reconcileNow=61*HOUR;
  assert.equal(selectProduction(history,latestDueSlot).sha,'A');
  assert.equal(selectProduction(history,reconcileNow).sha,'B');
});
test('MODEL: unchanged production source still creates distinct per-day delivery intents',()=>{
  const source='aged-A';const make=slot=>({id:`production/${slot}`,slot,source});
  const first=make(33*HOUR),second=make(57*HOUR);
  assert.notEqual(first.id,second.id);assert.equal(first.source,second.source);
});


const pausedWorkerCode = String.raw`
const fs=require('node:fs');
const [authPath,providerPath]=process.argv.slice(1);
const authorization=JSON.parse(fs.readFileSync(authPath,'utf8'));
process.send({type:'authorized-and-paused',owner:authorization.owner,pid:process.pid});
process.once('message',message=>{
  if(message!=='invoke')throw Error('unexpected message');
  // Deliberately no second lease check: exposes the authorization-to-call gap.
  fs.appendFileSync(providerPath,JSON.stringify({owner:authorization.owner,operation:authorization.operation})+'\n');
  process.send({type:'mutated'},()=>process.disconnect());
});
`;
function durableJSON(path,value){writeFileSync(path,JSON.stringify(value));const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function launchPausedWorker(authPath,providerPath){
  const child=spawn(process.execPath,['-e',pausedWorkerCode,authPath,providerPath],{stdio:['ignore','pipe','pipe','ipc']});
  let errors='';child.stderr.on('data',x=>errors+=x);
  const messages=[];const waiters=[];
  child.on('message',message=>{const w=waiters.shift();if(w)w.resolve(message);else messages.push(message);});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal,errors})));
  const nextMessage=()=>messages.length?Promise.resolve(messages.shift()):new Promise((resolve,reject)=>{
    const waiter={resolve:message=>{clearTimeout(timer);resolve(message);}};
    const timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(Error('owned worker IPC timeout: '+errors));},2000);
    waiters.push(waiter);
  });
  return {child,exited,nextMessage,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};
}
function effectFixture(){const root=mkdtempSync(join(tmpdir(),'cd-v2-worker-'));return {root,auth:join(root,'authorization.json'),provider:join(root,'provider-effects.jsonl')};}

test('REAL PROCESS: paused authorized worker can still mutate after durable lease expiry and replacement authorization',{timeout:5000},async()=>{
  const f=effectFixture();let worker;
  try{
    const initialExpiration=Date.now()+250;durableJSON(f.auth,{owner:'old',operation:'upload/201',fence:1,expires:initialExpiration});
    worker=launchPausedWorker(f.auth,f.provider);assert.equal((await worker.nextMessage()).type,'authorized-and-paused');
    assert.ok(Date.now()<initialExpiration);await new Promise(resolve=>setTimeout(resolve,Math.max(0,initialExpiration-Date.now()+5)));assert.ok(Date.now()>initialExpiration);
    durableJSON(f.auth,{owner:'new',operation:'upload/201',fence:2,expires:Date.now()+60000,previousLeaseExpiredAt:initialExpiration,githubJobStatus:'completed',githubJobConclusion:'cancelled'});
    assert.equal(JSON.parse(readFileSync(f.auth,'utf8')).githubJobStatus,'completed');
    assert.equal(worker.child.exitCode,null); // Server-side terminal status did not terminate this runner's process.
    // This replacement authorization is deliberately UNSAFE: expiry did not stop old code.
    appendFileSync(f.provider,JSON.stringify({owner:'replacement',operation:'upload/201'})+'\n');
    worker.child.send('invoke');assert.equal((await worker.nextMessage()).type,'mutated');
    assert.equal((await worker.exited).code,0);
    const effects=readFileSync(f.provider,'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(effects.map(e=>e.owner),['replacement','old']);
    console.log('real paused worker: durable fence changed 1→2; old process still invoked; duplicate operation observed');
  }finally{if(worker)await worker.stop();rmSync(f.root,{recursive:true,force:true});}
});

test('REAL PROCESS: terminate and confirm owned paused worker exit before authorizing next attempt',{timeout:5000},async()=>{
  const f=effectFixture();const workers=[];
  try{
    const initialExpiration=Date.now()+250;durableJSON(f.auth,{owner:'old',operation:'upload/201',fence:1,expires:initialExpiration});
    const old=launchPausedWorker(f.auth,f.provider);workers.push(old);await old.nextMessage();
    assert.ok(Date.now()<initialExpiration);await new Promise(resolve=>setTimeout(resolve,Math.max(0,initialExpiration-Date.now()+5)));assert.ok(Date.now()>initialExpiration);
    durableJSON(f.auth,{owner:'old',operation:'upload/201',fence:1,expires:initialExpiration,expiredObservedAt:Date.now()});
    assert.equal(existsSync(f.provider),false);
    const oldPid=old.child.pid;assert.equal(old.child.kill('SIGTERM'),true);
    const termination=await old.exited;assert.equal(termination.signal,'SIGTERM');
    assert.throws(()=>process.kill(oldPid,0),{code:'ESRCH'});
    // The owned process exited before any local provider call. A real request already in
    // flight would additionally require provider/session terminal reconciliation.
    durableJSON(f.auth,{owner:'next',operation:'upload/202',fence:2,expires:Date.now()+60000,previousExecutorExitConfirmed:true});
    const next=launchPausedWorker(f.auth,f.provider);workers.push(next);await next.nextMessage();
    next.child.send('invoke');await next.nextMessage();assert.equal((await next.exited).code,0);
    const effects=readFileSync(f.provider,'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(effects,[{owner:'next',operation:'upload/202'}]);
    console.log('real paused worker: SIGTERM exit confirmed and PID absent; only next authorized attempt mutated');
  }finally{for(const worker of workers)await worker.stop();rmSync(f.root,{recursive:true,force:true});}
});

function reconcileProviderUpload(intent,observation){
  if(observation.uploadStatus==='FAILED')return {...clone(intent),state:'repairing',nextAction:'repair-upload',providerUploadStatus:'FAILED',diagnostics:clone(observation.diagnostics),terminalUploadEvidence:clone(observation),reservedBuild:intent.reservedBuild};
  if(observation.build)return {...clone(intent),state:'processing',nextAction:'read-exact-build',providerBuildId:observation.build.id};
  return {...clone(intent),state:'waiting',nextAction:'reconcile-upload',blocker:'provider-outcome-uncertain'};
}
test('MODEL: explicit terminal provider upload FAILED without build surfaces diagnostics and permits repair',()=>{
  const input={id:'d-failed',state:'uploading',reservedBuild:201};
  const observation={uploadStatus:'FAILED',build:null,uploadId:'u-1',diagnostics:[{code:'INVALID_BINARY',message:'Missing required entitlement'}]};
  const result=reconcileProviderUpload(input,observation);
  assert.equal(result.state,'repairing');assert.equal(result.nextAction,'repair-upload');
  assert.deepEqual(result.diagnostics,observation.diagnostics);assert.equal(result.terminalUploadEvidence.uploadId,'u-1');assert.equal(result.reservedBuild,201);
  assert.equal(reconcileProviderUpload(result,observation).state,'repairing');
});
test('MODEL: no build with nonterminal/unknown upload status remains uncertain rather than masquerading as FAILED',()=>{
  assert.equal(reconcileProviderUpload({id:'d'}, {uploadStatus:'PROCESSING',build:null}).nextAction,'reconcile-upload');
  assert.equal(reconcileProviderUpload({id:'d'}, {uploadStatus:'UNKNOWN',build:null}).state,'waiting');
});

function planProductionCatchup(dueSlots,existing){
  const protectedIntents=existing.filter(i=>i.started||i.attempts.length>0);
  const protectedSlots=new Set(protectedIntents.map(i=>i.slot));
  const unstarted=dueSlots.filter(slot=>!protectedSlots.has(slot)).sort((a,b)=>a-b);
  if(!unstarted.length)return {intents:clone(protectedIntents),decisions:[]};
  const latest=unstarted.at(-1);
  return {intents:[...clone(protectedIntents),{id:`production/${latest}`,slot:latest,started:false,attempts:[],coalescedSlots:unstarted.slice(0,-1)}],decisions:unstarted.slice(0,-1).map(slot=>({slot,status:'missed-coalesced',targetSlot:latest}))};
}
test('MODEL: production outage coalesces only never-started daily slots to latest due catch-up and records earlier slots',()=>{
  const days=[33,57,81].map(x=>x*HOUR);
  const result=planProductionCatchup(days,[]);
  assert.equal(result.intents.length,1);assert.equal(result.intents[0].slot,81*HOUR);
  assert.deepEqual(result.intents[0].coalescedSlots,[33,57].map(x=>x*HOUR));
  assert.deepEqual(result.decisions.map(d=>d.slot),[33,57].map(x=>x*HOUR));
  assert.ok(result.decisions.every(d=>d.status==='missed-coalesced'&&d.targetSlot===81*HOUR));
});
test('MODEL: started failed production intent and attempts survive later-slot coalescing',()=>{
  const failed={id:'production/old',slot:33*HOUR,started:true,state:'repairing',originalSource:'bad',attempts:[{id:'attempt-1',status:'failed'}]};
  const result=planProductionCatchup([33,57,81].map(x=>x*HOUR),[failed]);
  assert.deepEqual(result.intents[0],failed);assert.equal(result.intents.length,2);
  assert.equal(result.intents[1].slot,81*HOUR);assert.deepEqual(result.decisions.map(x=>x.slot),[57*HOUR]);
});
function selectNonquarantined(history,slot,quarantine){return history.findLast(s=>sourceEligible(s,slot)&&!quarantine.has(s.inputDigest));}
test('MODEL: bad app digest remains quarantined across daily boundary while fixed app source ages',()=>{
  const bad={sha:'bad',firstMainAt:0,inputDigest:'bad-inputs'},fix={sha:'fix',firstMainAt:58*HOUR,inputDigest:'fixed-inputs'};
  const quarantined=new Set(['bad-inputs']);
  assert.equal(selectNonquarantined([bad,fix],81*HOUR,quarantined),undefined);
  assert.equal(selectNonquarantined([bad,fix],82*HOUR,quarantined).sha,'fix');
  assert.equal(selectNonquarantined([bad,fix],105*HOUR,quarantined).sha,'fix');
  assert.equal(quarantined.has('bad-inputs'),true);
  // A new daily slot must not simply retry the known-bad source because the fix is young.
});

function completeWithoutRegression(state,delivery){
  const next={...clone(state),receipts:{...state.receipts,[delivery.id]:clone(delivery.receipt)}};
  if(delivery.sourceOrder>state.cursorOrder){next.cursorOrder=delivery.sourceOrder;next.cursor=delivery.source;}
  const forwardPromotion=delivery.sourceOrder>state.groupPromotionOrder||(delivery.sourceOrder===state.groupPromotionOrder&&delivery.slot>state.groupPromotionSlot);
  if(forwardPromotion){next.groupPromotionOrder=delivery.sourceOrder;next.groupPromotionSlot=delivery.slot;next.groupBuild=delivery.build;next.groupPromotionActions=[...state.groupPromotionActions,{build:delivery.build,source:delivery.source}];}
  return next;
}
test('MODEL: out-of-order completion stores old receipt but cannot regress operational cursor or ordinary group promotion',()=>{
  const initial={cursorOrder:0,cursor:'seed',groupPromotionOrder:0,groupBuild:100,groupPromotionActions:[],receipts:{}};
  const newer={id:'new',source:'B',sourceOrder:2,build:202,receipt:{exact:'build-202'}};
  const older={id:'old',source:'A',sourceOrder:1,build:201,receipt:{exact:'build-201'}};
  const completed=completeWithoutRegression(completeWithoutRegression(initial,newer),older);
  assert.equal(completed.cursor,'B');assert.equal(completed.groupBuild,202);
  assert.equal(Object.keys(completed.receipts).length,2);assert.deepEqual(completed.receipts.old,older.receipt);
  assert.deepEqual(completed.groupPromotionActions,[{build:202,source:'B'}]);
});
test('MODEL: replayed or same-source older-build completion adds no ordinary group-promotion action',()=>{
  const initial={cursorOrder:2,cursor:'B',groupPromotionOrder:2,groupBuild:202,groupPromotionActions:[],receipts:{}};
  const oldSameSource={id:'old-build',source:'B',sourceOrder:2,build:201,receipt:{exact:'build-201'}};
  const after=completeWithoutRegression(initial,oldSameSource);
  assert.equal(after.cursor,'B');assert.equal(after.groupBuild,202);assert.deepEqual(after.groupPromotionActions,[]);
});

test('MODEL: later daily delivery of unchanged source may promote its newer build; late prior-day completion cannot undo it',()=>{
  const initial={cursorOrder:2,cursor:'B',groupPromotionOrder:2,groupPromotionSlot:33*HOUR,groupBuild:201,groupPromotionActions:[],receipts:{}};
  const today={id:'today',slot:57*HOUR,source:'B',sourceOrder:2,build:202,receipt:{exact:'build-202'}};
  const yesterday={id:'yesterday',slot:33*HOUR,source:'B',sourceOrder:2,build:201,receipt:{exact:'build-201'}};
  const result=completeWithoutRegression(completeWithoutRegression(initial,today),yesterday);
  assert.equal(result.groupBuild,202);assert.equal(result.groupPromotionSlot,57*HOUR);assert.equal(result.cursor,'B');
  assert.deepEqual(result.groupPromotionActions,[{build:202,source:'B'}]);
});
