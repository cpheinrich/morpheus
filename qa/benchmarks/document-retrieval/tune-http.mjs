import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {originalPath} from './qmd.mjs';
import {recallAt} from './score.mjs';

const [root, url = 'http://127.0.0.1:8197/query'] = process.argv.slice(2);
const output = join(root, 'development-http-results.json');
if (existsSync(output)) throw Error('Preserve prior attempts');
const fixtures = JSON.parse(readFileSync(join(root, 'development.json'))).filter(q => q.project === 'evo');
const rows = [];
const warmup = performance.now();
const warmed = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({searches: [{type: 'vec', query: 'project documentation history'}], rerank: false, limit: 3})});
await warmed.json();
console.log(JSON.stringify({warmupMs: performance.now() - warmup, status: warmed.status}));
for (let repeat = 0; repeat < 3; repeat++) for (const q of fixtures) {
  const lex = q.keywords.replace(/[A-Z]{2}-\d{2}-\d{2}-\d{2}-[\d.]+/g, s => s.replace(/[.-]/g, ' '));
  for (const mode of ['lex-default', 'lex-global', 'hybrid-default', 'hybrid-global']) {
    const searches = [{type: 'lex', query: lex}];
    if (mode.startsWith('hybrid')) searches.push({type: 'vec', query: q.question});
    const params = {searches, rerank: false, candidateLimit: 10, limit: 10, intent: q.question};
    if (mode.endsWith('global')) params.collections = [];
    const start = performance.now();
    let result = null, error = null;
    try {
      const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(params)});
      result = await response.json();
      if (!response.ok) throw Error(JSON.stringify(result));
    } catch (e) { error = String(e); }
    const paths = (result?.results ?? []).map(r => originalPath(r.file.replace(/^qmd:\/\//, '')));
    rows.push({id: q.id, mode, repeat, ms: performance.now() - start, error, paths,
      outputChars: JSON.stringify(result).length, recall5: recallAt(q.groups, paths, 5), recall10: recallAt(q.groups, paths, 10)});
  }
}
writeFileSync(output, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({queries: rows.length, errors: rows.filter(r => r.error).length}));
