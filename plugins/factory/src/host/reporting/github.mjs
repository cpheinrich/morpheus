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
    const ids=result[key].map(row=>row.id);
    const consistent=result.total_count>=0&&result.total_count===ids.length&&ids.every(id=>Number.isSafeInteger(id)&&id>0)&&new Set(ids).size===ids.length;
    return {rows:result[key].slice(0,limit),complete:recentSample||(consistent&&result.total_count<=limit)};
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
async function runnerSnapshot(context,repository,now) {
  const listed=await page(context,`repos/${repository}/actions/runners?per_page=100&page=1`,'runners',100);
  const valid=r=>Number.isSafeInteger(r.id)&&r.id>0&&['online','offline'].includes(r.status)&&typeof r.busy==='boolean'&&Array.isArray(r.labels)&&r.labels.every(l=>typeof l.name==='string');
  const ids=listed.rows.map(row=>row.id);
  const validRows=listed.rows.filter(row=>valid(row)&&ids.filter(id=>id===row.id).length===1);
  return {runners:validRows.map(r=>({projectId:repository,runnerId:r.id,online:r.status==='online',busy:r.busy,labels:r.labels.map(l=>l.name).slice(0,20)})),
    census:{projectId:repository,runnerComplete:listed.complete&&validRows.length===listed.rows.length,runnerObservedAt:now().toISOString(),jobComplete:false,jobObservedAt:now().toISOString()}};
}
function sameBaseRepository(reference,repository) {
  const base=reference?.base,url=`https://api.github.com/repos/${repository}`;
  const identities=[[base?.repo?.full_name,repository],[base?.repo_url,url],[base?.repo?.url,url]]
    .filter(([actual])=>actual!==undefined);
  return identities.length>0&&identities.every(([actual,expected])=>actual===expected);
}
function runPullRequests(run,repository) {
  if(!Array.isArray(run.pull_requests))return {};
  const references=run.pull_requests.filter(ref=>Number.isSafeInteger(ref?.number)&&ref.number>0&&sameBaseRepository(ref,repository));
  const pullRequests=[...new Set(references.map(ref=>ref.number))].slice(0,3);
  return pullRequests.length?{pullRequests}:{};
}
async function projectJobs(context,repository) {
  const runs=await currentRuns(context,repository),jobs=[];let complete=runs.complete;
  for(const run of runs.rows) {
    const result=await page(context,`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=1`,'jobs',100);
    complete=complete&&result.complete;
    const pullRequests=runPullRequests(run,repository);
    for(const j of result.rows)jobs.push({repository,runId:run.id,attempt:run.run_attempt,jobId:j.id,runnerId:j.runner_id>0?j.runner_id:null,...pullRequests,
      name:j.name,currentStep:(j.steps??[]).find(s=>s.status==='in_progress')?.name??null,
      state:j.status,conclusion:j.conclusion??null,url:`https://github.com/${repository}/actions/runs/${run.id}/job/${j.id}`});
  }
  return {jobs,complete};
}
export async function githubSnapshot(repositories,read=ghRead,now=()=>new Date(),organization={}) {
  const context={calls:0,deadline:Date.now()+25000,read},jobs=[],runners=[],censuses=[];
  const projects=[...new Set(repositories)];
  for(const repo of projects) {
    const value=await runnerSnapshot(context,repo,now),room=100-runners.length;
    if(value.runners.length>room)value.census.runnerComplete=false;
    runners.push(...value.runners.slice(0,room));censuses.push(value.census);
  }
  const orgRunners=await organizationRunners(organization.entries??[],organization.tokenEnv,{...organization,now,deadline:context.deadline,canRead:()=>++context.calls<=20});
  for(const census of censuses) {
    const value=await projectJobs(context,census.projectId),room=100-jobs.length;
    census.jobComplete=value.complete&&value.jobs.length<=room;census.jobObservedAt=now().toISOString();
    jobs.push(...value.jobs.slice(0,room));
  }
  return {complete:censuses.every(c=>c.runnerComplete&&c.jobComplete)&&orgRunners.every(r=>r.readable),value:{jobs,runners,censuses,orgCensus:'unavailable',...(orgRunners.length?{orgRunners}:{})}};
}
