import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { organizationRunners } from './org-runners.mjs';
const exec = promisify(execFile);
export async function ghRead(path) {
  return JSON.parse((await exec('gh',['api','--hostname','github.com',path],{timeout:10000,maxBuffer:1024*1024})).stdout);
}
async function page(context,path,key,limit,recentSample=false) {
  try {
    if(++context.calls>20 || Date.now()>context.deadline)throw new Error('incomplete');
    const result=await context.read(path);
    if(!Array.isArray(result[key]) || !Number.isSafeInteger(result.total_count))throw new Error('invalid-source');
    return {rows:result[key].slice(0,limit),complete:recentSample || result.total_count<=limit};
  } catch {return {rows:[],complete:false};}
}
async function currentRuns(context,repository) {
  const runs=new Map();let complete=true;
  for(const status of ['queued','in_progress']) {
    const result=await page(context,`repos/${repository}/actions/runs?status=${status}&per_page=5&page=1`,'workflow_runs',5);
    complete=complete&&result.complete;
    for(const run of result.rows)runs.set(run.id,run);
  }
  if(!runs.size) {
    const latest=await page(context,`repos/${repository}/actions/runs?per_page=1&page=1`,'workflow_runs',1,true);
    complete=complete&&latest.complete;
    for(const run of latest.rows)runs.set(run.id,run);
  }
  return {rows:[...runs.values()].slice(0,5),complete:complete&&runs.size<=5};
}
async function projectSnapshot(context,repository,now) {
  const listed=await page(context,`repos/${repository}/actions/runners?per_page=100&page=1`,'runners',100);
  const runnerObservedAt=now().toISOString();
  const runners=listed.rows.map(r=>({projectId:repository,runnerId:r.id,online:r.status==='online',busy:r.busy,labels:(r.labels??[]).map(l=>l.name).slice(0,20)}));
  const runs=await currentRuns(context,repository),jobs=[];let complete=runs.complete;
  for(const run of runs.rows) {
    const result=await page(context,`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=1`,'jobs',100);
    complete=complete&&result.complete;
    for(const j of result.rows)jobs.push({repository,runId:run.id,attempt:run.run_attempt,jobId:j.id,runnerId:j.runner_id>0?j.runner_id:null,
      name:j.name,currentStep:(j.steps??[]).find(s=>s.status==='in_progress')?.name??null,
      state:j.status,conclusion:j.conclusion??null,url:`https://github.com/${repository}/actions/runs/${run.id}/job/${j.id}`});
  }
  return {jobs,runners,census:{projectId:repository,runnerComplete:listed.complete,runnerObservedAt,
    jobComplete:complete,jobObservedAt:now().toISOString()}};
}
export async function githubSnapshot(repositories,read=ghRead,now=()=>new Date(),organization={}) {
  const context={calls:0,deadline:Date.now()+25000,read},jobs=[],runners=[],censuses=[];
  for(const repo of new Set(repositories)) {
    const value=await projectSnapshot(context,repo,now);
    const runnerRoom=100-runners.length,jobRoom=100-jobs.length;
    if(value.runners.length>runnerRoom)value.census.runnerComplete=false;
    if(value.jobs.length>jobRoom)value.census.jobComplete=false;
    jobs.push(...value.jobs.slice(0,jobRoom));runners.push(...value.runners.slice(0,runnerRoom));censuses.push(value.census);
  }
  const orgRunners=await organizationRunners(organization.entries??[],organization.tokenEnv,{...organization,now,deadline:context.deadline,canRead:()=>++context.calls<=20});
  return {complete:censuses.every(c=>c.runnerComplete&&c.jobComplete)&&orgRunners.every(r=>r.readable),value:{jobs,runners,censuses,orgCensus:'unavailable',...(orgRunners.length?{orgRunners}:{})}};
}
