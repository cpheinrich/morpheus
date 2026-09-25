import {describe,it,expect} from 'vitest';
import {sourceWindow} from '../qa/benchmarks/document-retrieval/history-retrieval.mjs';
import {scoreHistoryEvidence,summarizeHistory} from '../qa/benchmarks/document-retrieval/history-scoring.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

describe('historical retrieval evidence',()=>{
  const quote='The archival requirement preserves original event identity.';
  const groups=[[{path:'docs/a.md',text:quote}]];
  it('scores only source-valid prefetched citations and records actual availability',()=>{
    const events=[{atMs:27,event:{type:'benchmark.prefetch',passages:[{path:'docs/a.md',text:quote}]}}];
    const result=scoreHistoryEvidence(groups,[{path:'docs/a.md',quote}],events,p=>p==='docs/a.md'?quote:null);
    expect(result.recall).toBe(1);expect(result.evidenceMs).toBe(27);
    expect(scoreHistoryEvidence(groups,[{path:'docs/a.md',quote}],events,()=>null).recall).toBe(0);
  });
  it('does not credit a source that was not actually supplied',()=>{
    const result=scoreHistoryEvidence(groups,[{path:'docs/a.md',quote}],[],()=>quote);
    expect(result.recall).toBe(1);expect(result.evidenceMs).toBe(null);
  });
  it('requires all evidence groups for a complete availability time',()=>{
    const result=scoreHistoryEvidence([...groups,[{path:'docs/b.md',text:quote}]],[{path:'docs/a.md',quote}],
      [{atMs:7,event:{type:'benchmark.prefetch',passages:[{text:quote}]}}],()=>quote);
    expect(result.recall).toBe(.5);expect(result.evidenceMs).toBe(null);
  });
  it('returns a bounded contiguous original window at the supplied anchor',()=>{
    const body=Array.from({length:80},(_,i)=>'line '+i).join('\n');
    const hit=sourceWindow(body,'absent',100,body.indexOf('line 40\n'));
    expect(hit.fromLine).toBe(36);
    expect(hit.text).toBe(body.split('\n').slice(35,70).join('\n').slice(0,100));
    expect(body.includes(hit.text)).toBe(true);
  });
  it('uses query terms when no semantic anchor is supplied',()=>{
    const body='a\nb\nc\nd\ne\nf\ng\nh\nunique target\nj';
    expect(sourceWindow(body,'unique target')).toEqual({fromLine:4,text:'d\ne\nf\ng\nh\nunique target\nj'});
  });
  it('computes paired speedups, not a ratio of marginal medians',()=>{
    const base={repeat:0,status:'completed',recall:1,toolCalls:1,toolOutputChars:100,answerPass:true};
    const rows=[{...base,id:'A',arm:'baseline',ms:10000},{...base,id:'B',arm:'baseline',ms:20000},
      {...base,id:'A',arm:'prefetch-vector',ms:2000},{...base,id:'B',arm:'prefetch-vector',ms:10000}];
    const result=summarizeHistory(rows);
    expect(result.pairs[0]!.medianSpeedup).toBe(3.5);
    expect(result.pairs[0]!.medianSavedMs).toBe(9000);
    expect(result.pairs[0]!.substantialWins).toBe(2);
    expect(result.summaries[1]!.medianMs).toBe(6000);
  });
  it('retains failures in quality denominators and refuses incomplete pairs',()=>{
    const row={id:'A',repeat:0,arm:'baseline',ms:120000,status:'timeout',recall:0,toolCalls:0,toolOutputChars:0};
    expect(summarizeHistory([row]).summaries[0]!.strictRecall).toBe(0);
    expect(summarizeHistory([row]).summaries[0]!.errors).toBe(1);
    expect(()=>summarizeHistory([row,{...row,id:'B',arm:'cli'}])).toThrow('Missing matched trial');
  });
});

describe('historical result publication',()=>{
  function fixture(change:(root:string)=>void=()=>{}) {
    const root=mkdtempSync(join(tmpdir(),'history-publication-'));
    const put=(path:string,data:unknown)=>writeFileSync(join(root,path),JSON.stringify(data));
    const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
    const quote='Private archival requirement preserves original event identity.';
    mkdirSync(join(root,'evo/docs'),{recursive:true});mkdirSync(join(root,'trial'));
    writeFileSync(join(root,'evo/docs/private.md'),quote);
    put('evo/snapshot.json',{files:[{path:'docs/private.md',sha256:hash(quote)}]});
    put('questions.json',[{id:'D01',question:'PRIVATE QUESTION',groups:[[{path:'docs/private.md',text:quote}]]}]);
    put('development.json',JSON.parse(readFileSync(join(root,'questions.json'),'utf8')));
    put('trial/config.json',{fixture:'questions.json',fixtureSha256:hash(readFileSync(join(root,'questions.json'),'utf8')),
      arms:['baseline','prefetch-vector'],repeats:1,model:'gpt-6-astra',effort:'high',timestamp:'2026-09-25'});
    const audit=[];
    for(const [order,arm] of ['baseline','prefetch-vector'].entries()) {
      const prefix='trial/D01-'+arm+'-0';
      put(prefix+'.result.json',{id:'D01',arm,repeat:0,order,status:'completed',ms:1000,prefetchMs:arm==='baseline'?null:10});
      put(prefix+'.answer.json',{answer:'PRIVATE ANSWER',citations:[{path:'docs/private.md',quote}]});
      put(prefix+'.events.json',arm==='baseline'?[]:[{atMs:12,event:{type:'benchmark.prefetch',passages:[{path:'docs/private.md',fromLine:1,text:quote}]}}]);
      audit.push({stage:'trial',id:'D01',arm,repeat:0,answerPass:true,reason:'PRIVATE AUDIT',additions:[]});
    }
    put('answer-audit.json',audit);put('publication-stages.json',['trial']);
    put('history-engine.json',['prefetch-vector','prefetch-auto','prefetch-mini','prefetch-rerank'].map(mode=>({
      id:'D01',mode,ms:10,recall4:1,question:'PRIVATE QUERY',result:{passages:[{path:'docs/private.md',fromLine:1,text:quote}]}})));
    try {
      change(root);
      const result=spawnSync(process.execPath,['qa/benchmarks/document-retrieval/publish-history.mjs',root,join(root,'public')],{encoding:'utf8'});
      return {status:result.status,error:result.stderr,publicText:result.status===0?readFileSync(join(root,'public/measurements.json'),'utf8'):''};
    } finally {rmSync(root,{recursive:true,force:true});}
  }
  it('publishes metrics without questions, answers, paths or audit text',()=>{
    const result=fixture();expect(result.status).toBe(0);
    expect(result.publicText).not.toMatch(/PRIVATE|private\.md|archival requirement/);
    expect(JSON.parse(result.publicText).agents).toHaveLength(2);
  });
  it('refuses missing experimental cells',()=>{
    const result=fixture(root=>rmSync(join(root,'trial/D01-baseline-0.result.json')));
    expect(result.status).not.toBe(0);expect(result.error).toContain('Incomplete stage');
  });
  it('refuses zero completion time instead of publishing infinite speedup',()=>{
    const result=fixture(root=>{
      const path=join(root,'trial/D01-baseline-0.result.json'),row=JSON.parse(readFileSync(path,'utf8'));
      row.ms=0;writeFileSync(path,JSON.stringify(row));
    });
    expect(result.status).not.toBe(0);expect(result.error).toContain('Invalid trial');
  });
  it('refuses incomplete backend screening',()=>{
    const result=fixture(root=>writeFileSync(join(root,'history-engine.json'),'[]'));
    expect(result.status).not.toBe(0);expect(result.error).toContain('Incomplete engine screening');
  });
  it('refuses corpus drift',()=>{
    const result=fixture(root=>writeFileSync(join(root,'evo/docs/private.md'),'changed'));
    expect(result.status).not.toBe(0);expect(result.error).toContain('Snapshot drift');
  });
  it('refuses invented prefetched passages',()=>{
    const result=fixture(root=>writeFileSync(join(root,'trial/D01-prefetch-vector-0.events.json'),JSON.stringify([
      {atMs:12,event:{type:'benchmark.prefetch',passages:[{path:'docs/private.md',fromLine:1,text:'invented source content'}]}}
    ])));
    expect(result.status).not.toBe(0);expect(result.error).toContain('Invalid prefetched source');
  });
  it('refuses prefetch timestamps after completion',()=>{
    const result=fixture(root=>{
      const path=join(root,'trial/D01-prefetch-vector-0.events.json'),events=JSON.parse(readFileSync(path,'utf8'));
      events[0].atMs=1001;writeFileSync(path,JSON.stringify(events));
    });
    expect(result.status).not.toBe(0);expect(result.error).toContain('Invalid prefetch timing');
  });
  it('refuses unavailable audit alternatives',()=>{
    const result=fixture(root=>{
      const path=join(root,'answer-audit.json'),audit=JSON.parse(readFileSync(path,'utf8'));
      audit[0].additions=[{group:0,path:'docs/private.md',quote:'Invented alternative evidence is not present.'}];
      writeFileSync(path,JSON.stringify(audit));
    });
    expect(result.status).not.toBe(0);expect(result.error).toContain('Invalid alternative evidence');
  });
});
