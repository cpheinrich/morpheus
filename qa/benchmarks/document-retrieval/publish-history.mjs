import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {digest,normalize,recallAt} from './score.mjs';
import {scoreHistoryEvidence,summarizeHistory} from './history-scoring.mjs';
import {outputText} from './evidence-timing.mjs';

const [root,destination]=process.argv.slice(2);
if(!destination)throw Error('Usage: publish-history.mjs PRIVATE_ROOT PUBLIC_DESTINATION');
const read=p=>JSON.parse(readFileSync(p));
const manifest=read(join(root,'evo/snapshot.json'));
for(const f of manifest.files)if(digest(readFileSync(join(root,'evo',f.path)))!==f.sha256)throw Error('Snapshot drift');
const allowed=new Set(manifest.files.map(f=>f.path));
const source=p=>allowed.has(p)?readFileSync(join(root,'evo',p),'utf8'):null;
function verifyPassage(passage) {
 const original=source(passage.path);
 if(original===null||typeof passage.text!=='string'||!Number.isInteger(passage.fromLine)||passage.fromLine<1||!original.split('\n').slice(passage.fromLine-1).join('\n').startsWith(passage.text))throw Error('Invalid prefetched source');
}
const audit=read(join(root,'answer-audit.json'));
const used=new Set(),rows=[],receipts=[];
const configFiles=read(join(root,'publication-stages.json'));
for(const stage of configFiles) {
 const directory=join(root,stage);
 const config=read(join(directory,'config.json'));
 const bytes=readFileSync(join(root,config.fixture)),fixtures=JSON.parse(bytes);
 if(digest(bytes)!==config.fixtureSha256)throw Error('Fixture drift');
 const files=readdirSync(directory).filter(f=>f.endsWith('.result.json'));
 if(files.length!==fixtures.length*config.arms.length*config.repeats)throw Error('Incomplete stage');
 const seen=new Set();
 for(const file of files) {
  const row=read(join(directory,file)),q=fixtures.find(q=>q.id===row.id);
  const key=stage+'/'+row.id+'/'+row.arm+'/'+row.repeat;
  if(!q||!/^([DV])\d{2}$/.test(row.id)||!config.arms.includes(row.arm)||!Number.isInteger(row.repeat)||row.repeat<0||row.repeat>=config.repeats||seen.has(key)||!Number.isFinite(row.ms)||row.ms<=0||!['completed','timeout','error'].includes(row.status))throw Error('Invalid trial');
  seen.add(key);
  const expected=(config.arms.indexOf(row.arm)-(fixtures.indexOf(q)+row.repeat)%config.arms.length+config.arms.length)%config.arms.length;
  if(row.order!==expected)throw Error('Counterbalance mismatch');
  const prefix=join(directory,file.replace(/\.result\.json$/,''));
  const events=read(prefix+'.events.json');
  const answer=row.status==='completed'?read(prefix+'.answer.json'):{citations:[]};
  const score=scoreHistoryEvidence(q.groups,answer.citations,events,source);
  const a=audit.find(a=>a.stage===stage&&a.id===row.id&&a.arm===row.arm&&a.repeat===row.repeat);
  if(!a||used.has(a)||typeof a.answerPass!=='boolean'||typeof a.reason!=='string'||!a.reason.trim())throw Error('Missing/invalid answer audit');
  used.add(a);
  if(row.status!=='completed'&&(a.answerPass||a.additions?.length))throw Error('Cannot rescue failed trial');
  const groups=q.groups.map(g=>[...g]);
  for(const alt of a.additions??[]) {
   const text=source(alt.path);
   if(!Number.isInteger(alt.group)||!groups[alt.group]||text===null||normalize(alt.quote).length<30||
      !normalize(text).includes(normalize(alt.quote))||!answer.citations.some(c=>c.path===alt.path&&c.quote===alt.quote))throw Error('Invalid alternative evidence');
   groups[alt.group].push({path:alt.path,text:alt.quote});
  }
  const adjusted=scoreHistoryEvidence(groups,answer.citations,events,source);
  const tools=events.filter(e=>e.event.type==='item.completed'&&['command_execution','mcp_tool_call'].includes(e.event.item?.type)).map(e=>e.event.item);
  const supplied=events.filter(e=>e.event.type==='benchmark.prefetch');
  if(row.arm.startsWith('prefetch-')&&supplied.length!==1)throw Error('Missing prefetch event');
  if(!row.arm.startsWith('prefetch-')&&supplied.length)throw Error('Unexpected prefetch');
  for(const event of supplied) {
   if(!Number.isFinite(event.atMs)||event.atMs<0||event.atMs>row.ms||!Number.isFinite(row.prefetchMs)||row.prefetchMs<0||row.prefetchMs>event.atMs)throw Error('Invalid prefetch timing');
   for(const passage of event.event.passages)verifyPassage(passage);
  }
  const prefetchChars=supplied.length?JSON.stringify(supplied[0].event.passages).length:0;
  rows.push({stage,id:row.id,arm:row.arm,repeat:row.repeat,order:row.order,status:row.status,ms:row.ms,
   recall:score.recall,auditedRecall:adjusted.recall,answerPass:a.answerPass,
   invalidCitations:score.invalidCitations,alternativeCount:a.additions?.length??0,
   prefetchMs:row.prefetchMs,prefetchChars,toolCalls:tools.length,
   emptySuccessfulToolOutputs:tools.filter(t=>t.type==='command_execution'&&t.exit_code===0&&t.aggregated_output==='').length,
   toolOutputChars:tools.reduce((n,t)=>n+outputText(t).length,0),
   qmdCliCalls:tools.filter(t=>t.type==='command_execution'&&/\bqmd\s+(search|query|vsearch|get|multi-get)\b/.test(t.command??'')).length,
   qmdDatabaseErrors:tools.filter(t=>/SQLITE_CANTOPEN|SQLITE_READONLY|SQLITE_BUSY/.test(t.aggregated_output??'')).length,
   inputTokens:row.usage?.input_tokens??null,cachedInputTokens:row.usage?.cached_input_tokens??null,outputTokens:row.usage?.output_tokens??null});
 }
 receipts.push({stage,fixtureSha256:digest(bytes),configSha256:digest(readFileSync(join(directory,'config.json'))),
   model:config.model,effort:config.effort,questions:fixtures.length,arms:config.arms,repeats:config.repeats,
   projectDocMaxBytes:config.projectDocMaxBytes,frozenAt:config.timestamp});
}
if(used.size!==audit.length)throw Error('Unknown/duplicate audit row');
const developmentBytes=readFileSync(join(root,'development.json'));
const development=JSON.parse(developmentBytes),engineRows=read(join(root,'history-engine.json'));
const modes=['prefetch-mini','prefetch-vector','prefetch-auto','prefetch-rerank'],engineSeen=new Set();
if(engineRows.length!==development.length*modes.length)throw Error('Incomplete engine screening');
const engines=engineRows.map(r=>{
 const q=development.find(q=>q.id===r.id),key=r.id+'/'+r.mode;
 if(!q||!/^D\d{2}$/.test(r.id)||!modes.includes(r.mode)||engineSeen.has(key)||!Number.isFinite(r.ms)||r.ms<0)throw Error('Invalid engine row');
 engineSeen.add(key);
 if(!r.error)for(const passage of r.result.passages)verifyPassage(passage);
 const recall=r.error?0:recallAt(q.groups,r.result.passages.map(p=>p.path),4);
 if(recall!==r.recall4)throw Error('Engine score mismatch');
 return {id:r.id,mode:r.mode,ms:r.ms,recall4:recall,failed:!!r.error};
});
const stages=Object.fromEntries(configFiles.map(stage=>[stage,summarizeHistory(rows.filter(r=>r.stage===stage))]));
const validation=rows.filter(r=>r.stage==='history-validation');
// Post-hoc sensitivity declared in the report; primary rows are never removed.
const sensitivity=validation.length?{excludedIds:['V09','V20'],
 ...summarizeHistory(validation.filter(r=>!['V09','V20'].includes(r.id)))}:null;
mkdirSync(destination,{recursive:true});
writeFileSync(join(destination,'measurements.json'),JSON.stringify({receipts,engineFixtureSha256:digest(developmentBytes),engines,agents:rows},null,2)+'\n');
writeFileSync(join(destination,'summary.json'),JSON.stringify({stages,sensitivity},null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,engineRows:engines.length,stages}));
