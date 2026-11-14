import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHistoryRetriever} from './history-retrieval.mjs';
import {recallAt,mean,quantile} from './score.mjs';
const [root]=process.argv.slice(2);
const output=join(root,'history-engine.json');
if(existsSync(output)) throw Error('Preserve previous measurements');
const fixtures=JSON.parse(readFileSync(join(root,'development.json')));
const retriever=await createHistoryRetriever(root), rows=[];
const modes=['prefetch-vector','prefetch-auto','prefetch-mini','prefetch-rerank'];
try {
 console.log(JSON.stringify({setup:retriever.setup}));
 for(const q of fixtures) for(const mode of modes) {
  const start=performance.now();let result=null,error=null;
  try{result=await retriever.retrieve(mode,q.question);}catch(e){error=String(e);}
  rows.push({id:q.id,mode,ms:performance.now()-start,error,result,
   recall4:result?recallAt(q.groups,result.passages.map(p=>p.path),4):0});
  writeFileSync(output,JSON.stringify(rows,null,2));
  console.log(JSON.stringify({id:q.id,mode,ms:rows.at(-1).ms,recall4:rows.at(-1).recall4,error}));
 }
} finally {await retriever.close();}
console.log(JSON.stringify(modes.map(mode=>{const r=rows.filter(x=>x.mode===mode);return {mode,medianMs:quantile(r.map(x=>x.ms),.5),recall4:mean(r.map(x=>x.recall4))};})));
