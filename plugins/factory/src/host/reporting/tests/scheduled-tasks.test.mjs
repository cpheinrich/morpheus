import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshness, parseReport, scheduledTaskDocument } from '../protocol.mjs';
import { configSchema, snapshot } from '../reporter.mjs';

const observedAt = '2026-11-06T12:00:00.000Z';
const sampledAt = '2026-11-06T12:10:00.000Z';
const now = () => new Date(sampledAt);
const task = {id:'refresh',repository:'example/project',cadence:'twice-monthly',
  nextAt:'2026-11-15T13:00:00.000Z',lastRunAt:'2026-11-01T13:10:00.000Z',
  status:'partial',runId:null,pullRequests:[123,124]};
const deployment = {runId:987,attempt:2,observedAt,startedAt:'2026-11-06T11:00:00.000Z',
  sourceSha:'a'.repeat(40),state:'unknown',stages:[{id:'confirm',jobId:456,state:'running'}]};

function report(tasks) {
  return {schemaVersion:1,hostId:'host-a',samples:{schedule:{kind:'scheduledTasks',
    sampledAt,sourceObservedAt:observedAt,status:'ok',errorCode:null,value:{tasks}}}};
}

test('scheduled task wire rejects unsafe additions, duplicate identities and impossible clocks', () => {
  assert.deepEqual(parseReport(report([task]), now().valueOf()), report([task]));
  for (const rows of [
    [task,task],
    [{...task,url:'https://example.invalid'}],
    [{...task,cadence:'/private/scheduled'}],
    [{...task,cadence:'event-driven'}],
    [{...task,pullRequests:[123,123]}],
    [{...task,runId:-5}],
  ]) assert.throws(() => parseReport(report(rows),now().valueOf()), /invalid-report/);
  assert.throws(() => parseReport(report([{...task,lastRunAt:sampledAt}]),now().valueOf()), /source-clock/);
});

test('reporter preserves the producer timestamp and refuses missing or nonprivate state', async t => {
  const dir = await mkdtemp(join(tmpdir(),'infra-schedule-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const statePath = join(dir,'schedule.json');
  const config = configSchema.parse({version:1,hostId:'host-a',
    endpoint:'https://example.invalid/report',tokenEnv:'REPORT_TOKEN',projectPaths:{},
    routeAccounts:{},sources:[{id:'schedule',kind:'scheduledTasks',statePath}]});
  assert.equal((await snapshot(config,{now})).samples.schedule.status,'error');
  await writeFile(statePath,JSON.stringify({version:1,observedAt,tasks:[task]}),{mode:0o600});
  const sample = (await snapshot(config,{now})).samples.schedule;
  assert.deepEqual(sample,report([task]).samples.schedule);
  assert.equal(freshness(sample,now().valueOf()),'stale');
  await chmod(statePath,0o644);
  assert.equal((await snapshot(config,{now})).samples.schedule.status,'error');
});

test('optional deployments preserve exact evidence and leave legacy tasks unchanged', () => {
  const rows = [{...task,deployments:[deployment]}];
  const document = {version:1,observedAt,tasks:rows};
  assert.deepEqual(scheduledTaskDocument.parse(document),document);
  assert.deepEqual(parseReport(report(rows),now().valueOf()),report(rows));
  assert.equal('deployments' in scheduledTaskDocument.parse({version:1,observedAt,tasks:[task]}).tasks[0],false);
  const states = ['queued','running','succeeded','failed','cancelled','skipped','unknown'];
  for(const state of states) {
    const unknownStage = {...deployment,sourceSha:null,state,stages:[{id:'future-stage',jobId:1,state}]};
    assert.deepEqual(parseReport(report([{...task,deployments:[unknownStage]}]),now().valueOf()).samples.schedule.value.tasks[0].deployments,[unknownStage]);
  }
});

test('deployment bounds, numeric identities, allowlists and uniqueness apply to document and wire', () => {
  const five = Array.from({length:5},(_,i)=>({...deployment,runId:i+1}));
  const sixteen = Array.from({length:16},(_,i)=>({id:`stage-${i}`,jobId:i+1,state:'unknown'}));
  const valid = [{...task,deployments:five.map(row=>({...row,stages:sixteen}))}];
  assert.deepEqual(parseReport(report(valid),now().valueOf()),report(valid));
  const invalid = [
    null,[...five,{...deployment,runId:6}],[deployment,deployment],
    [deployment,{...deployment,attempt:3}],
    ...[0,-1,1.5,Number.MAX_SAFE_INTEGER+1].flatMap(n=>[
      [{...deployment,runId:n}],[{...deployment,attempt:n}],
      [{...deployment,stages:[{...deployment.stages[0],jobId:n}]}],
    ]),
    ...['A'.repeat(40),'a'.repeat(39),'a'.repeat(41),'g'.repeat(40)].map(sourceSha=>[{...deployment,sourceSha}]),
    [{...deployment,sourceSha:undefined}], [{...deployment,observedAt:'not-a-date'}],
    [{...deployment,startedAt:'2026-02-30T00:00:00Z'}],
    [{...deployment,state:'success'}], [{...deployment,url:'https://example.invalid'}],
    [{...deployment,stages:[...sixteen,{id:'stage-16',jobId:17,state:'unknown'}]}],
    [{...deployment,stages:[...deployment.stages,...deployment.stages]}],
    [{...deployment,stages:[{id:'../unsafe',jobId:1,state:'unknown'}]}],
    [{...deployment,stages:[{id:'confirm',jobId:1,state:'completed'}]}],
    [{...deployment,stages:[{id:'confirm',jobId:1,state:'unknown',name:'private'}]}],
  ];
  for(const deployments of invalid) {
    const tasks = [{...task,deployments}];
    assert.equal(scheduledTaskDocument.safeParse({version:1,observedAt,tasks}).success,false,JSON.stringify(deployments));
    assert.throws(()=>parseReport(report(tasks),now().valueOf()),/invalid-report/);
  }
});

test('deployment clocks use the producer clock and accept exactly sixty seconds of skew', () => {
  for(const field of ['observedAt','startedAt']) {
    const boundary = {...deployment,[field]:'2026-11-06T12:01:00.000Z'};
    const rows = [{...task,deployments:[boundary]}];
    assert.deepEqual(parseReport(report(rows),now().valueOf()),report(rows));
    const future = {...boundary,[field]:'2026-11-06T12:01:00.001Z'};
    assert.throws(()=>parseReport(report([{...task,deployments:[future]}]),now().valueOf()),/source-clock/);
  }
});

test('real file reporter carries old deployment time and rejects unsafe files and clocks', async t => {
  const dir = await mkdtemp(join(tmpdir(),'infra-deployments-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const statePath = join(dir,'scheduled-tasks.json');
  const config = configSchema.parse({version:1,hostId:'host-a',endpoint:'https://example.invalid/report',
    tokenEnv:'REPORT_TOKEN',projectPaths:{},routeAccounts:{},sources:[{id:'schedule',kind:'scheduledTasks',statePath}]});
  const old = {...deployment,observedAt:'2026-11-06T11:30:00.000Z'};
  const tasks = [{...task,deployments:[old]}];
  await writeFile(statePath,JSON.stringify({version:1,observedAt,tasks}),{mode:0o600});
  const expected = report(tasks).samples.schedule;
  assert.deepEqual((await snapshot(config,{now})).samples.schedule,expected);
  const later = ()=>new Date('2026-11-06T12:11:00.000Z');
  const reread = (await snapshot(config,{now:later})).samples.schedule;
  assert.equal(reread.sourceObservedAt,observedAt);
  assert.deepEqual(reread.value.tasks[0].deployments,[old]);
  assert.equal(freshness(reread,later().valueOf()),'stale');
  await writeFile(statePath,JSON.stringify({version:1,observedAt,tasks:[{...task,deployments:[{...deployment,observedAt:sampledAt}]}]}));
  assert.deepEqual((await snapshot(config,{now})).samples.schedule,{kind:'scheduledTasks',sampledAt,
    sourceObservedAt:null,status:'error',errorCode:'invalid-source',value:null});
  await rm(statePath);
  const target = join(dir,'target.json');
  await writeFile(target,JSON.stringify({version:1,observedAt,tasks}),{mode:0o600});
  await symlink(target,statePath);
  assert.equal((await snapshot(config,{now})).samples.schedule.status,'error');
  await rm(statePath);
  await writeFile(statePath,'x'.repeat(65537),{mode:0o600});
  assert.equal((await snapshot(config,{now})).samples.schedule.status,'error');
});
