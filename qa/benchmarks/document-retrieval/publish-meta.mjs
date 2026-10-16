import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest,normalize,quantile,mean} from './score.mjs';
import {scoreHistoryEvidence,summarizeHistory} from './history-scoring.mjs';

// Paired against any reference arm, so metadata can be compared with plain prefetch directly.
export function pairArms(rows,reference,arm) {
  const ps=rows.filter(r=>r.arm===reference).map(b=>{
    const q=rows.find(r=>r.id===b.id&&r.repeat===b.repeat&&r.arm===arm);
    if(!q)throw Error('Missing matched trial');
    return {speedup:b.ms/q.ms,savedMs:b.ms-q.ms};
  });
  return {reference,arm,n:ps.length,medianSpeedup:quantile(ps.map(p=>p.speedup),.5),
    medianSavedMs:quantile(ps.map(p=>p.savedMs),.5),wins:ps.filter(p=>p.savedMs>0).length,
    substantialWins:ps.filter(p=>p.speedup>=2&&p.savedMs>=5000).length};
}

// The adoption bar from the protocol, evaluated rather than eyeballed.
export function adoption(summary,pair,baseline) {
  return {medianSpeedupAtLeast2:pair.medianSpeedup>=2,medianSavingAtLeast5s:pair.medianSavedMs>=5000,
    auditedRecallAtLeast95:summary.auditedRecall>=.95,withinFivePointsOfBaseline:summary.auditedRecall>=baseline.auditedRecall-.05,
    meets:pair.medianSpeedup>=2&&pair.medianSavedMs>=5000&&summary.auditedRecall>=.95&&summary.auditedRecall>=baseline.auditedRecall-.05};
}

function publish(root,destination) {
  const read=p=>JSON.parse(readFileSync(p));
  const sources={};
  const corpus=name=>sources[name]??=(()=>{
    const manifest=read(join(root,name,'snapshot.json'));
    for(const f of manifest.files)if(f.sha256&&digest(readFileSync(join(root,name,f.path)))!==f.sha256)throw Error('Snapshot drift');
    const allowed=new Set(manifest.files.map(f=>f.path));
    return {revision:manifest.revision,files:manifest.files.length,bytes:manifest.bytes,
      text:p=>allowed.has(p)?readFileSync(join(root,name,p),'utf8'):null};
  })();
  const verifyPassage=(c,p)=>{
    const original=c.text(p.path);
    if(original===null||typeof p.text!=='string'||!Number.isInteger(p.fromLine)||p.fromLine<1||
      !original.split('\n').slice(p.fromLine-1).join('\n').startsWith(p.text))throw Error('Invalid prefetched source');
  };
  const audit=read(join(root,'heldout-answer-audit.json')),used=new Set();
  const retrieval=read(join(root,'retrieval-freeze.json')),heldoutFreeze=read(join(root,'heldout-freeze.json'));
  if(digest(readFileSync(new URL('./meta-retrieval.mjs',import.meta.url)))!==retrieval.retrieverSha256)throw Error('Retriever differs from its freeze');
  const rows=[],receipts=[];
  for(const stage of ['pilot','pilot-opus','heldout']) {
    const directory=join(root,stage),configBytes=readFileSync(join(directory,'config.json')),config=JSON.parse(configBytes);
    const bytes=readFileSync(join(root,config.fixture)),fixtures=JSON.parse(bytes);
    if(digest(bytes)!==config.fixtureSha256)throw Error('Fixture drift');
    if(stage==='heldout'&&(digest(bytes)!==heldoutFreeze.sha256||config.retrieverSha256!==retrieval.retrieverSha256))throw Error('Held-out freeze mismatch');
    const files=readdirSync(directory).filter(f=>f.endsWith('.result.json'));
    if(files.length!==fixtures.length*config.arms.length*config.repeats)throw Error('Incomplete stage');
    const seen=new Set();
    for(const file of files) {
      const row=read(join(directory,file)),q=fixtures.find(q=>q.id===row.id),key=row.id+'/'+row.arm+'/'+row.repeat;
      if(!q||!/^[A-Z]{1,2}[A-Z]\d{2}$/.test(row.id)||!config.arms.includes(row.arm)||!Number.isInteger(row.repeat)||row.repeat<0||
        row.repeat>=config.repeats||seen.has(key)||!Number.isFinite(row.ms)||row.ms<=0||!['completed','timeout','error','stopped'].includes(row.status))throw Error('Invalid trial');
      seen.add(key);
      const expected=(config.arms.indexOf(row.arm)-(fixtures.indexOf(q)+row.repeat)%config.arms.length+config.arms.length)%config.arms.length;
      if(row.order!==expected)throw Error('Counterbalance mismatch');
      const c=corpus(q.corpus),prefix=join(directory,file.replace(/\.result\.json$/,''));
      const events=read(prefix+'.events.json');
      const answer=row.status==='completed'?read(prefix+'.answer.json'):{citations:[]};
      const score=scoreHistoryEvidence(q.groups,answer.citations??[],events,c.text);
      if(score.recall!==row.recall)throw Error('Score mismatch');
      const supplied=events.filter(e=>e.event.type==='benchmark.prefetch');
      // The first Sonnet pilot predates excluding the structured-answer call; derive both from events.
      const started=events.filter(e=>e.event.type==='item.started');
      const answerCall=started.find(e=>/^StructuredOutput /.test(e.event.item.command??''));
      const toolCalls=started.filter(e=>e!==answerCall).length;
      const answerAtMs=row.answerAtMs??answerCall?.atMs??null;
      if(row.arm==='baseline'?supplied.length!==0:supplied.length!==1)throw Error('Prefetch event mismatch');
      for(const e of supplied) {
        if(!(e.atMs>=row.prefetchMs&&e.atMs<=row.ms))throw Error('Invalid prefetch timing');
        for(const p of e.event.passages)verifyPassage(c,p);
      }
      let auditedRecall=score.recall,answerPass=null,answerPassAsWritten=null,alternativeCount=0;
      if(stage==='heldout') {
        const a=audit.find(a=>a.id===row.id&&a.arm===row.arm&&a.repeat===row.repeat);
        if(!a||used.has(a)||typeof a.answerPass!=='boolean'||typeof a.answerPassAsWritten!=='boolean'||typeof a.reason!=='string'||!a.reason.trim())throw Error('Missing/invalid answer audit');
        used.add(a);
        if(row.status!=='completed'&&(a.answerPass||a.answerPassAsWritten||a.additions?.length))throw Error('Cannot rescue failed trial');
        const groups=q.groups.map(g=>[...g]);
        for(const alt of a.additions??[]) {
          const text=c.text(alt.path);
          if(!Number.isInteger(alt.group)||!groups[alt.group]||text===null||normalize(alt.quote).length<30||
            !normalize(text).includes(normalize(alt.quote))||!answer.citations.some(x=>x.path===alt.path&&x.quote===alt.quote))throw Error('Invalid alternative evidence');
          groups[alt.group].push({path:alt.path,text:alt.quote});
        }
        auditedRecall=scoreHistoryEvidence(groups,answer.citations??[],events,c.text).recall;
        answerPass=a.answerPass;answerPassAsWritten=a.answerPassAsWritten;alternativeCount=a.additions?.length??0;
      }
      rows.push({stage,id:row.id,project:q.project,intent:q.intent??null,arm:row.arm,repeat:row.repeat,order:row.order,status:row.status,
        ms:row.ms,answerAtMs,prefetchMs:row.prefetchMs,prefetchChars:supplied.length?JSON.stringify(supplied[0].event.passages).length:0,
        recall:score.recall,auditedRecall,answerPass,answerPassAsWritten,alternativeCount,invalidCitations:score.invalidCitations,
        toolCalls,toolErrors:row.toolErrors,toolOutputChars:row.toolOutputChars,modelTurns:row.modelTurns,apiMs:row.apiMs,
        inputTokens:row.inputTokens,cachedInputTokens:row.cachedInputTokens,outputTokens:row.outputTokens,model:row.model});
    }
    receipts.push({stage,fixtureSha256:config.fixtureSha256,configSha256:digest(configBytes),model:config.model,effort:config.effort,
      questions:fixtures.length,arms:config.arms,repeats:config.repeats,timeoutMs:config.timeoutMs,usageCeiling:config.usageCeiling});
  }
  if(used.size!==audit.length)throw Error('Unknown/duplicate audit row');
  const screens=['screen-frozen-dev','screen-heldout'].map(name=>{
    const s=read(join(root,name+'.result.json'));
    const fixture=name==='screen-heldout'?'heldout.json':'dev-fixtures.json';
    if(digest(readFileSync(join(root,fixture)))!==s.fixtureSha256)throw Error('Screen fixture drift');
    return {name,fixtureSha256:s.fixtureSha256,configSha256:s.configSha256,setup:s.setup,summary:s.summary,
      rows:s.rows.map(r=>({id:r.id,project:r.project,arm:r.arm,intent:r.intent,ms:r.ms,cold:r.cold,
        docRecall:r.docRecall,windowRecall:r.windowRecall,chars:r.chars,passages:r.passages}))};
  });
  const corpora=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{revision:v.revision,files:v.files,bytes:v.bytes}]));
  const stages={};
  for(const stage of ['pilot','pilot-opus','heldout']) {
    const rs=rows.filter(r=>r.stage===stage);
    const byProject=p=>{const x=rs.filter(r=>p==='all'||r.project===p);const s=summarizeHistory(x);
      const base=s.summaries.find(v=>v.arm==='baseline');
      return {...s,metaVsMini:pairArms(x,'prefetch-mini','prefetch-meta'),
        medianAnswerAtMs:Object.fromEntries(['baseline','prefetch-mini','prefetch-meta'].map(a=>[a,quantile(x.filter(r=>r.arm===a&&r.answerAtMs!=null).map(r=>r.answerAtMs),.5)])),
        // Two blind rubrics: facts the question asks for (primary), and every listed clause as written.
        answerPassRate:Object.fromEntries(['baseline','prefetch-mini','prefetch-meta'].map(a=>{const y=x.filter(r=>r.arm===a);
          return [a,{questionScoped:mean(y.map(r=>r.answerPass?1:0)),asWritten:y.some(r=>r.answerPassAsWritten!==null)?mean(y.map(r=>r.answerPassAsWritten?1:0)):null}];})),
        meanModelTurns:Object.fromEntries(['baseline','prefetch-mini','prefetch-meta'].map(a=>[a,mean(x.filter(r=>r.arm===a).map(r=>r.modelTurns??0))])),
        adoption:stage==='heldout'?Object.fromEntries(s.pairs.map(p=>[p.arm,adoption(s.summaries.find(v=>v.arm===p.arm),p,base)])):null};};
    stages[stage]={all:byProject('all'),lakina:byProject('lakina'),evo:byProject('evo')};
  }
  mkdirSync(destination,{recursive:true});
  writeFileSync(join(destination,'measurements.json'),JSON.stringify({receipts,corpora,
    retrievalFreeze:{frozenAt:retrieval.frozenAt,retrieverSha256:retrieval.retrieverSha256,devFixtureSha256:retrieval.devFixtureSha256},
    heldoutFreeze:{frozenAt:heldoutFreeze.frozenAt,sha256:heldoutFreeze.sha256,questions:heldoutFreeze.questions},
    screens,agents:rows},null,2)+'\n');
  writeFileSync(join(destination,'summary.json'),JSON.stringify({stages,screens:screens.map(s=>({name:s.name,summary:s.summary,setup:s.setup}))},null,2)+'\n');
  return {rows:rows.length,stages};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [root,destination]=process.argv.slice(2);
  if(!destination)throw Error('Usage: publish-meta.mjs PRIVATE_ROOT PUBLIC_DESTINATION');
  const r=publish(root,destination);
  console.log(JSON.stringify({rows:r.rows}));
}
