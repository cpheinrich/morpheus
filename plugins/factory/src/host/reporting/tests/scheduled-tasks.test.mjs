import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshness, parseReport } from '../protocol.mjs';
import { configSchema, snapshot } from '../reporter.mjs';

const observedAt = '2026-11-06T12:00:00.000Z';
const sampledAt = '2026-11-06T12:10:00.000Z';
const now = () => new Date(sampledAt);
const task = {id:'refresh',repository:'example/project',cadence:'twice-monthly',
  nextAt:'2026-11-15T13:00:00.000Z',lastRunAt:'2026-11-01T13:10:00.000Z',
  status:'partial',runId:null,pullRequests:[123,124]};

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
