import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import MiniSearch from 'minisearch';
import {openStore, originalPath} from './qmd.mjs';

// The same bounded source presentation is used for every prefetched engine.
export function sourceWindow(body, query, maxChars = 3000, anchor = null) {
  const lines = body.split('\n');
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  let best = 0, score = -1;
  for (let i = 0; i < lines.length; i++) {
    const n = terms.filter(t => lines[i].toLowerCase().includes(t)).length;
    if (n > score) {score = n; best = i;}
  }
  if (Number.isInteger(anchor) && anchor > 0) best = body.slice(0, anchor).split('\n').length - 1;
  const from = Math.max(0, best - 5);
  return {fromLine: from + 1, text: lines.slice(from, from + 35).join('\n').slice(0, maxChars)};
}

export async function createHistoryRetriever(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'evo/snapshot.json')));
  const docs = manifest.files.map(f => ({id: f.path, title: f.path,
    text: readFileSync(join(root, 'evo', f.path), 'utf8')}));
  const byPath = new Map(docs.map(d => [d.id, d]));
  const started = performance.now();
  const mini = new MiniSearch({fields: ['title', 'text'], storeFields: [], searchOptions: {boost: {title: 2}}});
  mini.addAll(docs);
  const miniIndexMs = performance.now() - started;
  const store = await openStore(root, 'evo');
  const warmStart = performance.now();
  await store.searchVector('documentation history decisions', {limit: 1});
  const warmupMs = performance.now() - warmStart;
  return {
    setup: {miniIndexMs, warmupMs, documents: docs.length},
    close: () => store.close(),
    async retrieve(mode, question, {limit = 4, maxChars = 3000} = {}) {
      if (!['prefetch-mini', 'prefetch-vector', 'prefetch-auto', 'prefetch-rerank'].includes(mode)) throw Error('Unknown retrieval mode');
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(maxChars) || maxChars < 1) throw Error('Invalid passage bounds');
      const start = performance.now();
      // Models/index stay warm, but no query expansion or reranker result is reused.
      store.internal.db.exec('DELETE FROM llm_cache');
      let hits;
      if (mode === 'prefetch-mini') hits = mini.search(question).slice(0, limit).map(r => ({path: r.id}));
      else {
        const result = mode === 'prefetch-vector'
          ? await store.searchVector(question, {limit})
          : await store.search({query: question, limit, candidateLimit: mode === 'prefetch-rerank' ? 8 : 20,
              rerank: mode === 'prefetch-rerank', collections: []});
        hits = result.map(r => ({path: originalPath(r.displayPath), anchor: r.bestChunkPos ?? r.chunkPos}));
      }
      const passages = hits.map(hit => {
        const doc = byPath.get(hit.path);
        if (!doc) throw Error('Search escaped frozen manifest');
        return {path: hit.path, ...sourceWindow(doc.text, question, maxChars, hit.anchor)};
      });
      return {mode, ms: performance.now() - start, passages};
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, mode, question] = process.argv.slice(2);
  const retriever = await createHistoryRetriever(root);
  try {console.log(JSON.stringify(await retriever.retrieve(mode, question)));}
  finally {await retriever.close();}
}
