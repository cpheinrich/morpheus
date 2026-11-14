import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {tokenize,sections,queryIntent,recordDate,recordType,createMetaRetriever,createPlainRetriever} from '../qa/benchmarks/document-retrieval/meta-retrieval.mjs';
import {scorePassages,fragments} from '../qa/benchmarks/document-retrieval/meta-screen.mjs';
import {claudeEvents,usageStop,childEnv,promptFor,stripLineNumbers} from '../qa/benchmarks/document-retrieval/claude-agents.mjs';

const ID='XX-26-09-01-10.00.00';
function corpus(files:Record<string,string>) {
  const root=mkdtempSync(join(tmpdir(),'meta-retrieval-'));
  for(const [path,body] of Object.entries(files)) {mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),body);}
  writeFileSync(join(root,'snapshot.json'),JSON.stringify({files:Object.keys(files).map(path=>({path}))}));
  return root;
}

describe('metadata-aware tokenization and records',()=>{
  it('keeps an identifier as one token instead of its date fields',()=>{
    const tokens=tokenize(`Scope of ${ID} today`);
    expect(tokens).toContain('xx260901100000');
    expect(tokens).not.toContain('26');expect(tokens).not.toContain('09');
    expect(tokens).toEqual(['scope','of','today','xx260901100000']);
  });
  it('splits long records by heading and bold lead, but never inside a code fence',()=>{
    const filler='word '.repeat(600);
    const body=`# Title\n${filler}\n## First\nalpha\n\`\`\`\n## not a heading\n\`\`\`\n## Second\nbeta`;
    expect(sections(body).map(s=>s.heading)).toEqual(['Title','First','Second']);
    expect(sections(body).find(s=>s.heading==='Second')!.startLine).toBe(8);
    expect(sections('# Short\nbody')).toEqual([{heading:'',startLine:1,text:'# Short\nbody'}]);
    const bullets=`# Learned\n${Array.from({length:3},(_,i)=>`- **Rule ${i}** ${'x'.repeat(2500)}`).join('\n')}`;
    expect(sections(bullets).length).toBe(4);
  });
  it('classifies historical wording and treats everything else as current state',()=>{
    expect(queryIntent('Why did the release fail?')).toBe('historical');
    expect(queryIntent('What was originally chosen?')).toBe('historical');
    expect(queryIntent('What changed on 2026-09 builds?')).toBe('historical');
    expect(queryIntent('When is a meal logged?')).toBe('current');
    expect(queryIntent('Which tests run on a pull request now?')).toBe('current');
  });
  it('prefers the recorded update date over names and identifiers',()=>{
    expect(recordDate('.agent/worklog/2026-01-02-a.md',{updated:'2026-03-04',date:'2026-02-02'})).toBe('2026-03-04');
    expect(recordDate('.agent/worklog/2026-01-02-a.md',{date:new Date('2026-02-02')})).toBe('2026-02-02');
    expect(recordDate('.agent/worklog/2026-01-02-a.md',{})).toBe('2026-01-02');
    expect(recordDate('hq/product/roadmap/x.md',{id:ID})).toBe('2026-09-01');
    expect(recordDate('docs/a.md',{})).toBe(null);
    expect(recordType('.agent/decisions/2026-01-01-a.md')).toBe('decision');
    expect(recordType('hq/product/roadmap/README.md')).toBe('index');
  });
});

describe('metadata-aware retrieval',()=>{
  let root='';
  const shared='The cache rotation policy keeps exactly three generations of widget snapshots on disk.';
  beforeAll(()=>{root=corpus({
    [`hq/product/roadmap/${ID}-alpha.md`]:`---\nid: ${ID}\ntitle: "Alpha widget"\nstatus: shipped\nupdated: 2026-09-03\n---\n\nShip the alpha widget.\n`,
    '.agent/worklog/2026-09-02-alpha.md':`---\ndate: 2026-09-02\nroadmap: ${ID}\n---\n\n# Alpha\n\n${shared}\n`,
    '.agent/decisions.md':`# Decisions\n\n${shared}\n`,
    // Mentions the id more often than its owner does, so only the lookup puts the owner first.
    'docs/scope-notes.md':`# Scope of ${ID}\n\nScope notes: ${ID}, ${ID}, ${ID}. What is the scope? Scope.`,
    ...Object.fromEntries(Array.from({length:6},(_,i)=>[`docs/filler-${i}.md`,`Released on 2026-09-01 at 10:00 with build 26 09 01 widget ${i}.`])),
  });});
  afterAll(()=>rmSync(root,{recursive:true,force:true}));

  it('returns the record a question names before any relevance guess',()=>{
    const r=createMetaRetriever(root).retrieve(`What is the scope of ${ID}?`);
    expect(r.passages[0]!.path).toBe(`hq/product/roadmap/${ID}-alpha.md`);
    expect(r.passages[0]).toMatchObject({type:'roadmap',date:'2026-09-03',status:'shipped',id:ID});
  });
  it('bundles the linked worklog within the plain arm budget',()=>{
    const r=createMetaRetriever(root,{limit:1,totalChars:400,linkedChars:300}).retrieve(`What is the scope of ${ID}?`);
    expect(r.passages.map(p=>p.path)).toEqual([`hq/product/roadmap/${ID}-alpha.md`,'.agent/worklog/2026-09-02-alpha.md']);
    expect(r.passages[1]!.linkedFrom).toBe(`hq/product/roadmap/${ID}-alpha.md`);
    expect(r.passages.reduce((n,p)=>n+p.text.length,0)).toBeLessThanOrEqual(400);
    const none=createMetaRetriever(root,{limit:1,totalChars:150}).retrieve(`What is the scope of ${ID}?`);
    expect(none.passages.length).toBe(1);
  });
  it('ranks canonical records first for current questions and worklogs first for historical ones',()=>{
    const r=createMetaRetriever(root);
    const current=r.retrieve('What is the cache rotation policy for widget snapshots?');
    const historical=r.retrieve('Why did the cache rotation policy for widget snapshots change originally?');
    expect(current.intent).toBe('current');expect(historical.intent).toBe('historical');
    expect(current.passages[0]!.path).toBe('.agent/decisions.md');
    expect(historical.passages[0]!.path).toBe('.agent/worklog/2026-09-02-alpha.md');
  });
  it('keeps the prior study control as whole-document windows',()=>{
    const r=createPlainRetriever(root,{limit:2,maxChars:50}).retrieve('cache rotation policy');
    expect(r.passages.length).toBe(2);
    expect(r.passages.every(p=>p.text.length<=50&&!('type' in p))).toBe(true);
  });
});

describe('prompt availability scoring',()=>{
  const text='Evidence that is long enough to quote exactly here. Short.';
  it('credits a group only when its quotable fragment is in a returned window',()=>{
    const groups=[[{path:'a.md',text}]];
    expect(scorePassages(groups,[{path:'a.md',text:'unrelated'}])).toMatchObject({docRecall:1,windowRecall:0});
    expect(scorePassages(groups,[{path:'b.md',text}])).toMatchObject({docRecall:0,windowRecall:0});
    expect(scorePassages(groups,[{path:'a.md',text:'x '+text}])).toMatchObject({docRecall:1,windowRecall:1});
  });
  it('ignores fragments shorter than a citable quote',()=>{
    expect(fragments('a'.repeat(28)+'. '+'b'.repeat(30))).toEqual(['b'.repeat(30)]);
    expect(fragments('a'.repeat(29))).toEqual([]);
  });
});

describe('Claude subscription trials',()=>{
  it('counts searches but not the structured answer, and strips read line numbers',()=>{
    const lines=[
      {atMs:1,event:{type:'system',subtype:'init',model:'m',tools:['Read']}},
      {atMs:2,event:{type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'Read',input:{file_path:'a.md'}}]}}},
      {atMs:3,event:{type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',content:'     1→first\n    12\tsecond'}]}}},
      {atMs:4,event:{type:'assistant',message:{content:[{type:'tool_use',id:'t2',name:'StructuredOutput',input:{answer:'x'}}]}}},
      {atMs:5,event:{type:'user',message:{content:[{type:'tool_result',tool_use_id:'t2',content:'ok'}]}}},
      {atMs:6,event:{type:'result',num_turns:3,structured_output:{answer:'x',citations:[]}}},
    ];
    const r=claudeEvents(lines);
    expect(r.events.map(e=>e.event.type)).toEqual(['item.started','item.completed']);
    expect(r.events[1]!.event.item.aggregated_output).toBe('first\nsecond');
    expect(r.answerAtMs).toBe(4);expect(r.init!.model).toBe('m');expect(r.result!.num_turns).toBe(3);
    expect(stripLineNumbers('2026 x')).toBe('2026 x');
  });
  it('stops on overage and at the utilization ceiling, not below it',()=>{
    expect(usageStop({isUsingOverage:true},.8)).toBe('overage');
    expect(usageStop({unifiedWindows:{seven_day:{utilization:.8}}},.8)).toBe('utilization seven_day 0.8');
    expect(usageStop({unifiedWindows:{seven_day:{utilization:.79},five_hour:{utilization:0}}},.8)).toBe(null);
    expect(usageStop(null,.8)).toBe(null);
  });
  it('never passes a provider key or parent session state to the child',()=>{
    const env=childEnv({PATH:'/bin',HOME:'/h',ANTHROPIC_API_KEY:'k',ANTHROPIC_BASE_URL:'u',CLAUDECODE:'1',
      CLAUDE_CODE_SESSION_ID:'s',CLAUDE_PLUGIN_ROOT:'p',CLAUDE_CONFIG_DIR:'c'});
    expect(env).toEqual({PATH:'/bin',HOME:'/h',CLAUDE_CONFIG_DIR:'c'});
  });
  it('differs between arms only in supplied passages and the metadata note',()=>{
    const base=promptFor('baseline','Q?');
    const mini=promptFor('prefetch-mini','Q?',[{path:'a.md'}]);
    const meta=promptFor('prefetch-meta','Q?',[{path:'a.md'}]);
    expect(base).not.toContain('Retrieved source data');
    expect(mini).toContain('Retrieved source data');expect(mini).not.toContain('record type, date and status');
    expect(meta).toContain('record type, date and status');
    expect(meta.replace(/Each passage names[^\n]*\n/,'')).toBe(mini);
  });
});

describe('metadata study publication',()=>{
  const secret='A private source sentence that must never be published verbatim.';
  function fixture(change:(root:string)=>void=()=>{}) {
    const root=mkdtempSync(join(tmpdir(),'meta-publication-'));
    const put=(path:string,data:unknown)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),typeof data==='string'?data:JSON.stringify(data));};
    put('c/docs/a.md',secret);
    put('c/snapshot.json',{revision:'r',bytes:secret.length,files:[{path:'docs/a.md',sha256:createHash('sha256').update(secret).digest('hex')}]});
    const q=[{id:'LF01',project:'lakina',corpus:'c',intent:'current',question:'Private question?',groups:[[{path:'docs/a.md',text:secret}]]}];
    const qBytes=JSON.stringify(q),sha=createHash('sha256').update(qBytes).digest('hex');
    for(const f of ['heldout.json','dev-fixtures.json','pilot-fixtures.json'])put(f,qBytes);
    const retrieverSha=createHash('sha256').update(readFileSync('qa/benchmarks/document-retrieval/meta-retrieval.mjs')).digest('hex');
    put('retrieval-freeze.json',{frozenAt:'t0',retrieverSha256:retrieverSha,devFixtureSha256:sha});
    put('heldout-freeze.json',{frozenAt:'t1',sha256:sha,questions:1});
    const arms=['baseline','prefetch-mini','prefetch-meta'];
    for(const stage of ['pilot','pilot-opus','heldout']) {
      put(`${stage}/config.json`,{fixture:stage==='heldout'?'heldout.json':'pilot-fixtures.json',fixtureSha256:sha,model:'m',effort:'high',
        arms,repeats:1,timeoutMs:1,usageCeiling:.8,retrieverSha256:retrieverSha});
      arms.forEach((arm,order)=>{
        const events=arm==='baseline'?[]:[{atMs:5,event:{type:'benchmark.prefetch',passages:[{path:'docs/a.md',fromLine:1,text:secret}]}}];
        put(`${stage}/LF01-${arm}-0.events.json`,events);
        put(`${stage}/LF01-${arm}-0.answer.json`,{answer:'private answer',citations:[{path:'docs/a.md',quote:secret}]});
        put(`${stage}/LF01-${arm}-0.result.json`,{id:'LF01',arm,repeat:0,order,status:'completed',ms:1000*(order+1),prefetchMs:arm==='baseline'?null:1,
          recall:1,answerAtMs:500,toolCalls:0,toolErrors:0,toolOutputChars:0,modelTurns:2,apiMs:1,inputTokens:1,cachedInputTokens:0,outputTokens:1,
          model:'m',rateLimit:{private:true},error:'private provider error'});
      });
    }
    put('heldout-answer-audit.json',arms.map(arm=>({id:'LF01',arm,repeat:0,answerPass:true,answerPassAsWritten:false,reason:'private reason',additions:[]})));
    for(const [name,fixture] of [['screen-frozen-dev','dev-fixtures.json'],['screen-heldout','heldout.json']])
      put(`${name}.result.json`,{fixtureSha256:sha,configSha256:'c',setup:[],summary:[],rows:[{id:'LF01',project:'lakina',arm:'meta',
        intent:'current',ms:1,cold:true,docRecall:1,windowRecall:1,chars:9,passages:1,question:'Private question?'}]});
    change(root);
    return root;
  }
  const run=(root:string)=>spawnSync(process.execPath,['qa/benchmarks/document-retrieval/publish-meta.mjs',root,join(root,'public')],{encoding:'utf8'});
  it('publishes metrics, hashes and opaque ids, never private text',()=>{
    const root=fixture();
    try {
      const result=run(root);
      expect(result.status,result.stderr).toBe(0);
      const text=readFileSync(join(root,'public/measurements.json'),'utf8')+readFileSync(join(root,'public/summary.json'),'utf8');
      for(const secretText of [secret,'Private question','private answer','private reason','private provider error','docs/a.md','"private"'])expect(text).not.toContain(secretText);
      const m=JSON.parse(readFileSync(join(root,'public/measurements.json'),'utf8'));
      expect(m.agents).toHaveLength(9);
      expect(Object.keys(m.agents[0]).sort()).toEqual(['alternativeCount','answerAtMs','answerPass','answerPassAsWritten','apiMs','arm','auditedRecall','cachedInputTokens',
        'id','inputTokens','intent','invalidCitations','model','modelTurns','ms','order','outputTokens','prefetchChars','prefetchMs','project',
        'recall','repeat','stage','status','toolCalls','toolErrors','toolOutputChars']);
      const s=JSON.parse(readFileSync(join(root,'public/summary.json'),'utf8'));
      expect(s.stages.heldout.all.metaVsMini.medianSpeedup).toBe(2/3);
      expect(s.stages.heldout.all.adoption['prefetch-meta'].meets).toBe(false);
      expect(s.stages.heldout.all.answerPassRate['prefetch-meta']).toEqual({questionScoped:1,asWritten:0});
      expect(s.stages.pilot.all.answerPassRate['prefetch-meta'].asWritten).toBe(null);
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it('refuses a missing audit, a changed source and a mismatched score',()=>{
    for(const change of [
      (root:string)=>writeFileSync(join(root,'heldout-answer-audit.json'),'[]'),
      (root:string)=>writeFileSync(join(root,'c/docs/a.md'),secret+' changed'),
      (root:string)=>{const f=join(root,'heldout/LF01-baseline-0.result.json');writeFileSync(f,JSON.stringify({...JSON.parse(readFileSync(f,'utf8')),recall:0}));},
    ]) {
      const root=fixture(change);
      try {expect(run(root).status).not.toBe(0);} finally {rmSync(root,{recursive:true,force:true});}
    }
  });
});
