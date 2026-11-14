import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openStore, originalPath} from './qmd.mjs';
import {recallAt, quantile, mean} from './score.mjs';

const [root, cacheMode = 'shared'] = process.argv.slice(2);
if (!root) throw new Error('Usage: node tune-search.mjs PRIVATE_ROOT');
const output = join(root, cacheMode === 'fresh' ? 'development-fresh-results.json' : 'development-results.json');
if (existsSync(output)) throw new Error('Preserve prior development attempts');
const fixtures = JSON.parse(readFileSync(join(root, 'development.json'), 'utf8')).filter(q => q.project === 'evo');
const store = await openStore(root, 'evo');
const modes = ['lex', 'lex-short', 'lex-multi', 'vector', 'hybrid-8', 'hybrid-40', 'hybrid-multi', 'rerank-8', 'rerank-16'];
const rows = [];
try {
  const start = performance.now();
  const warmup = await store.searchVector('project documentation and implementation history', {limit: 3});
  console.log(JSON.stringify({warmupMs: performance.now() - start, results: warmup.length}));
  for (const q of fixtures) {
    const lex = q.keywords.replace(/[A-Z]{2}-\d{2}-\d{2}-\d{2}-[\d.]+/g, s => s.replace(/[.-]/g, ' '));
    const exact = q.category === 'exact';
    const words = lex.split(/\s+/);
    const short = exact ? lex : words.slice(0, 2).join(' ');
    const lexes = exact ? [lex] : [short, words.slice(-2).join(' ')];
    for (const mode of modes) {
      // Only the disposable benchmark database is modified; keep models warm.
      if (cacheMode === 'fresh') store.internal.db.exec('DELETE FROM llm_cache');
      const started = performance.now();
      let hits = [], error = null;
      try {
        if (mode === 'lex' || mode === 'lex-short') hits = await store.searchLex(mode === 'lex' ? lex : short, {limit: 10});
        else if (mode === 'vector') hits = await store.searchVector(q.question, {limit: 10});
        else {
          const queries = (mode.includes('multi') ? lexes : [lex]).map(query => ({type: 'lex', query}));
          if (mode !== 'lex-multi') queries.push({type: 'vec', query: q.question});
          hits = await store.search({queries, intent: q.question, limit: 10,
            candidateLimit: mode.endsWith('-8') ? 8 : mode.endsWith('-16') ? 16 : 40,
            rerank: mode.startsWith('rerank')});
        }
      } catch (e) { error = String(e); }
      const ms = performance.now() - started;
      const paths = hits.map(h => originalPath(h.displayPath));
      rows.push({id: q.id, mode, cacheMode, ms, error, paths, recall5: recallAt(q.groups, paths, 5),
        recall10: recallAt(q.groups, paths, 10)});
      writeFileSync(output, JSON.stringify(rows, null, 2));
    }
    // OR terms discover candidates; their filesystem order is not relevance ranking.
    const terms = exact ? [q.keywords.replaceAll('"', '')] : q.keywords.split(/\s+/).filter(Boolean);
    const started = performance.now();
    const result = spawnSync('rg', ['--hidden', '--no-ignore', '-i', '-l', '-F', '-g', '*.md',
      ...terms.flatMap(term => ['-e', term]), '.'], {cwd: join(root, 'evo'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    const paths = (result.stdout ?? '').trim().split('\n').filter(Boolean).map(p => p.replace(/^\.\//, ''));
    rows.push({id: q.id, mode: 'rg-or', ms: performance.now() - started,
      error: result.error?.message ?? (result.status > 1 ? result.stderr : null), paths,
      matches: paths.length, outputChars: (result.stdout ?? '').length,
      recall5: recallAt(q.groups, paths, 5), recall10: recallAt(q.groups, paths, 10),
      recallAll: recallAt(q.groups, paths, paths.length)});
    writeFileSync(output, JSON.stringify(rows, null, 2));
    console.log(JSON.stringify({completed: q.id}));
  }
} finally { await store.close(); }
console.log(JSON.stringify([...modes, 'rg-or'].map(mode => {
  const rs = rows.filter(r => r.mode === mode);
  return {mode, n: rs.length, medianMs: quantile(rs.map(r => r.ms), .5),
    recall5: mean(rs.map(r => r.recall5)), recall10: mean(rs.map(r => r.recall10)),
    errors: rs.filter(r => r.error).length};
}), null, 2));
