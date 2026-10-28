import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {recallAt, reciprocalRank} from './score.mjs';

export async function openStore(root, project, dbSuffix = '') {
  if (!process.env.QMD_MODULE) throw new Error('Set QMD_MODULE to the pinned QMD dist/index.js');
  const {createStore} = await import(pathToFileURL(process.env.QMD_MODULE).href);
  const base = join(root, project);
  const definitions = {agent: '.agent', product: 'hq/product', docs: 'docs', root: '.'};
  const collections = Object.fromEntries(Object.entries(definitions).map(([name, path]) =>
    [name, {path: join(base, path), pattern: name === 'root' ? 'agent-instructions.md' : '**/*.md'}]));
  return createStore({dbPath: join(root, project + dbSuffix + '.sqlite'), config: {collections}});
}

export function originalPath(displayPath) {
  const [collection, ...rest] = displayPath.replace(/^qmd:\/\//, '').split('/');
  const prefix = {agent: '.agent/', product: 'hq/product/', docs: 'docs/', root: ''}[collection];
  if (prefix === undefined) throw new Error('Unmapped QMD collection: ' + collection);
  return prefix + rest.join('/');
}

export async function search(store, mode, question, keywords, limit = 10) {
  if (mode === 'bm25') return store.searchLex(keywords, {limit});
  if (mode === 'vector') return store.searchVector(question, {limit});
  return store.search(mode === 'full' ? {query: question, limit} : {
    queries: [{type: 'lex', query: keywords}, {type: 'vec', query: question}],
    limit, rerank: mode === 'rerank',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, root, project, mode] = process.argv.slice(2);
  const store = await openStore(root, project, action === 'evaluate' ? '-' + mode : '');
  try {
    if (action === 'index') {
      const start = performance.now();
      const update = await store.update();
      const updateMs = performance.now() - start;
      const embedStart = performance.now();
      const embed = await store.embed();
      const result = {project, updateMs, embedMs: performance.now() - embedStart, update, embed};
      writeFileSync(join(root, project + '-index.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
    } else if (action === 'evaluate') {
      const fixtures = JSON.parse(readFileSync(join(root, 'fixtures.json'), 'utf8')).filter(q => q.project === project);
      const rows = [];
      for (const [i, q] of fixtures.entries()) {
        const start = performance.now();
        let hits = [], error = null;
        try { hits = await search(store, mode, q.question, q.keywords); }
        catch (e) { error = String(e); }
        const ms = performance.now() - start;
        const paths = hits.map(hit => originalPath(hit.displayPath));
        const row = {id: q.id, project, category: q.category, mode, ms, firstQuery: i === 0,
          recall5: recallAt(q.groups, paths, 5), recall10: recallAt(q.groups, paths, 10),
          mrr: reciprocalRank(q.groups, paths), error, paths};
        rows.push(row);
        writeFileSync(join(root, project + '-' + mode + '-engine.json'), JSON.stringify(rows, null, 2));
        console.log(JSON.stringify({...row, paths: undefined}));
      }
    } else if (action === 'search') {
      const [question, keywords = question] = process.argv.slice(6);
      const hits = await search(store, mode, question, keywords, 8);
      console.log(JSON.stringify(hits.map(hit => ({
        path: originalPath(hit.displayPath), score: hit.score,
        excerpt: (hit.bestChunk ?? hit.body ?? '').slice(0, 2400),
      }))));
    } else throw new Error('Use index, evaluate, or search');
  } finally { await store.close(); }
}
