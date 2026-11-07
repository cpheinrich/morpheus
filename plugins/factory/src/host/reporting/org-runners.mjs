import {boundedJson} from './transport.mjs';
function enrolled(entry) {
  return !!entry&&typeof entry.organization==='string'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(entry.organization)&&Number.isSafeInteger(entry.runnerId)&&entry.runnerId>0&&
    Array.isArray(entry.projectIds)&&entry.projectIds.length>0&&entry.projectIds.length<=16&&
    entry.projectIds.every(p=>typeof p==='string'&&/^[\w.-]+\/[\w.-]+$/.test(p)&&p.split('/')[0]===entry.organization);
}
export function identityEntries(entries) {
  const unique=new Map();
  if(!Array.isArray(entries)||entries.length>16)throw new Error('invalid-source');
  for(const entry of entries) {
    if(!enrolled(entry))throw new Error('invalid-source');
    const key=entry.organization+':'+entry.runnerId,previous=unique.get(key);
    unique.set(key,{...entry,projectIds:[...new Set([...(previous?.projectIds??[]),...entry.projectIds])]});
  }
  if([...unique.values()].some(row=>row.projectIds.length>16))throw new Error('invalid-source');
  return [...unique.values()];
}
function validRunner(data,entry) {
  return data.id===entry.runnerId&&['online','offline'].includes(data.status)&&typeof data.busy==='boolean'&&
    Array.isArray(data.labels)&&data.labels.every(label=>typeof label.name==='string'&&label.name.length<=100);
}
export async function organizationRunners(entries,tokenEnv,{
  env=process.env,fetchImpl=fetch,now=()=>new Date(),deadline=Date.now()+25000,canRead=()=>true,
}={}) {
  const results=[];
  for(const entry of identityEntries(entries)) {
    const row={organization:entry.organization,runnerId:entry.runnerId,projectIds:entry.projectIds,
      observedAt:now().toISOString(),readable:false,online:null,busy:null,labels:[],gap:'credential-missing'};
    const token=env[tokenEnv];
    if(typeof token!=='string'||!token){results.push(row);continue;}
    try {
      if(Date.now()>=deadline||!canRead())throw new Error('unavailable');
      const response=await fetchImpl(`https://api.github.com/orgs/${entry.organization}/actions/runners/${entry.runnerId}`,{
        method:'GET',redirect:'error',headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2026-03-10'},
        signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now()))),
      });
      const data=await boundedJson(response,65536);
      if(!validRunner(data,entry))throw new Error('unavailable');
      Object.assign(row,{observedAt:now().toISOString(),readable:true,online:data.status==='online',busy:data.busy,
        labels:data.labels.map(label=>label.name).slice(0,20),gap:null});
    } catch {row.gap='unavailable';}
    results.push(row);
  }
  return results;
}
