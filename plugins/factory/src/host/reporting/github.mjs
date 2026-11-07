import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function ghRead(path) {
  return JSON.parse((await exec('gh',['api','--hostname','github.com',path],{timeout:10000,maxBuffer:1024*1024})).stdout);
}
async function page(context,path,key,limit) {
  try {
    if(++context.calls>20 || Date.now()>context.deadline)throw new Error('incomplete');
    const result=await context.read(path);
    if(!Array.isArray(result[key]))throw new Error('invalid-source');
    if(result.total_count>limit)context.complete=false;
    return result[key].slice(0,limit);
  } catch {context.complete=false;return [];}
}
async function currentRuns(context,repository) {
  const runs=new Map();
  for(const status of ['queued','in_progress']) {
    for(const run of await page(context,`repos/${repository}/actions/runs?status=${status}&per_page=5&page=1`,'workflow_runs',5))runs.set(run.id,run);
  }
  if(!runs.size)for(const run of await page(context,`repos/${repository}/actions/runs?per_page=1&page=1`,'workflow_runs',1))runs.set(run.id,run);
  if(runs.size>5)context.complete=false;
  return [...runs.values()].slice(0,5);
}
async function projectSnapshot(context,repository) {
  const runners=(await page(context,`repos/${repository}/actions/runners?per_page=100&page=1`,'runners',100))
    .map(r=>({projectId:repository,runnerId:r.id,online:r.status==='online',busy:r.busy,labels:(r.labels??[]).map(l=>l.name).slice(0,20)}));
  const jobs=[];
  for(const run of await currentRuns(context,repository)) {
    const rows=await page(context,`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=1`,'jobs',100);
    for(const j of rows)jobs.push({repository,runId:run.id,attempt:run.run_attempt,jobId:j.id,runnerId:j.runner_id>0?j.runner_id:null,
      name:j.name,currentStep:(j.steps??[]).find(s=>s.status==='in_progress')?.name??null,
      state:j.status,conclusion:j.conclusion??null,url:`https://github.com/${repository}/actions/runs/${run.id}/job/${j.id}`});
  }
  return {jobs,runners};
}
export async function githubSnapshot(repositories, read = ghRead) {
  const context={calls:0,complete:true,deadline:Date.now()+25000,read};const jobs=[],runners=[];
  for(const repo of new Set(repositories)) {
    const value=await projectSnapshot(context,repo);jobs.push(...value.jobs);runners.push(...value.runners);
  }
  if(jobs.length>100 || runners.length>100)context.complete=false;
  return {complete:context.complete,value:{jobs:jobs.slice(0,100),runners:runners.slice(0,100),orgCensus:'unavailable'}};
}
