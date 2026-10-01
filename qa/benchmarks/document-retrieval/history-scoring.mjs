import {scoreTimedEvidence} from './evidence-timing.mjs';
import {mean,quantile} from './score.mjs';

export function scoreHistoryEvidence(groups,citations,events,sourceText) {
  // A prompt passage is recorded availability, not an actual tool call or model attention.
  const exposures=events.map(e=>e.event.type==='benchmark.prefetch'
    ? {atMs:e.atMs,event:{type:'item.completed',item:{type:'command_execution',
        aggregated_output:JSON.stringify(e.event.passages)}}} : e);
  return scoreTimedEvidence(groups,citations,exposures,sourceText);
}

export function summarizeHistory(rows) {
  const groups=[...new Set(rows.map(r=>r.arm))];
  const summaries=groups.map(arm=>{
    const rs=rows.filter(r=>r.arm===arm);
    return {arm,n:rs.length,errors:rs.filter(r=>r.status!=='completed').length,
      emptySuccessfulToolOutputs:rs.reduce((n,r)=>n+(r.emptySuccessfulToolOutputs??0),0),
      strictRecall:mean(rs.map(r=>r.recall)),auditedRecall:mean(rs.map(r=>r.auditedRecall??r.recall)),
      answerPassRate:mean(rs.map(r=>r.answerPass===true?1:0)),
      noFurtherToolRuns:rs.filter(r=>r.toolCalls===0).length,
      medianMs:quantile(rs.map(r=>r.ms),.5),p95Ms:quantile(rs.map(r=>r.ms),.95),
      meanToolCalls:mean(rs.map(r=>r.toolCalls)),medianContextChars:quantile(rs.map(r=>r.toolOutputChars+(r.prefetchChars??0)),.5),
      medianInputTokens:quantile(rs.map(r=>r.inputTokens).filter(x=>x!=null),.5),
      medianUncachedInputTokens:quantile(rs.filter(r=>r.inputTokens!=null&&r.cachedInputTokens!=null).map(r=>Math.max(0,r.inputTokens-r.cachedInputTokens)),.5),
      medianOutputTokens:quantile(rs.map(r=>r.outputTokens).filter(x=>x!=null),.5),
      medianPrefetchMs:quantile(rs.map(r=>r.prefetchMs).filter(x=>x!=null),.5)};
  });
  const pairs=groups.filter(a=>a!=='baseline').map(arm=>{
    const bs=rows.filter(r=>r.arm==='baseline');
    const ps=bs.map(b=>{
      const q=rows.find(r=>r.id===b.id&&r.repeat===b.repeat&&r.arm===arm);
      if(!q)throw Error('Missing matched trial');
      return {id:b.id,repeat:b.repeat,speedup:b.ms/q.ms,savedMs:b.ms-q.ms};
    });
    return {arm,n:ps.length,medianSpeedup:quantile(ps.map(p=>p.speedup),.5),
      medianSavedMs:quantile(ps.map(p=>p.savedMs),.5),wins:ps.filter(p=>p.savedMs>0).length,
      substantialWins:ps.filter(p=>p.speedup>=2&&p.savedMs>=5000).length,pairs:ps};
  });
  return {summaries,pairs};
}
