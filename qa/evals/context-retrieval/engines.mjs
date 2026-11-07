import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import MiniSearch from 'minisearch';

const STOP = new Set('the and for with from that this who can what into while how without before after are have use using find where task work log worklog record section'.split(' '));
const identifierPattern = /\b[A-Z][A-Z0-9]+-\d{2}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}\b/gi;
const wordPattern = new RegExp(identifierPattern.source + '|[\\p{L}\\p{N}]+', 'giu');
const words = input => (input.toLowerCase().match(wordPattern) ?? [])
  .filter(word => word.length >= 3 && !STOP.has(word));
const terms = query => [...new Set(words(query))];
const LIMIT = 40;
const WINDOW = 16;
const STRIDE = 12;

function around(path, line, count) {
  const overlapMidpoint = Math.ceil((WINDOW - STRIDE) / 2);
  const first = 1 + Math.floor(Math.max(0, line - overlapMidpoint - 1) / STRIDE) * STRIDE;
  return { path, first, last: Math.min(count, first + WINDOW - 1) };
}

function position(path, line, documents) {
  return around(path, line, documents.get(path).lines.length);
}

export function prepareRipgrep(project, directory) {
  mkdirSync(directory);
  for (const { path, raw } of project.documents.values()) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, raw);
  }
  return (query, excluded) => {
    const tokens = terms(query);
    const identifier = query.match(identifierPattern)?.[0];
    if (!tokens.length && !identifier) return [];
    const expression = identifier ? identifier.replaceAll('.', '[.]') : tokens.join('|');
    const pattern = '\\b(?:' + expression + ')\\b';
    const result = spawnSync('rg', ['--no-config', '--hidden', '--no-ignore', '--json',
      '-i', '-g', '*.md', pattern, '.'], { cwd: directory, maxBuffer: 32 * 1024 * 1024, timeout: 15_000 });
    if (result.error || ![0, 1].includes(result.status)) throw Error('ripgrep query failed: ' + (result.error?.message ?? result.status));
    const hits = [];
    for (const json of result.stdout.toString().split('\n')) {
      if (!json) continue;
      const { type, data } = JSON.parse(json);
      if (type !== 'match') continue;
      const path = data.path.text.replace(/^\.\//, '');
      if (excluded.has(path)) continue;
      const score = new Set(data.submatches.map(hit => hit.match.text.toLowerCase())).size;
      hits.push({ path, line: data.line_number, score });
    }
    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, 'en') || a.line - b.line);
    return ripgrepShortlist(hits, project.documents);
  };
}

function ripgrepShortlist(hits, documents) {
  const shortlist = [];
  const byPath = new Map();
  for (const hit of hits) {
    const prior = byPath.get(hit.path) ?? [];
    const span = position(hit.path, hit.line, documents);
    if (prior.length === 2 || prior.some(p => p.first <= span.last && span.first <= p.last)) continue;
    prior.push(span);
    byPath.set(hit.path, prior);
    shortlist.push(span);
    if (shortlist.length === LIMIT) break;
  }
  return shortlist;
}

export function prepareMiniSearch(project, rich) {
  const index = new MiniSearch({
    fields: rich ? ['title', 'heading', 'pathWords', 'body'] : ['body'],
    storeFields: ['path', 'first', 'last'],
    tokenize: words,
  });
  const chunks = [];
  for (const { path, lines } of project.documents.values()) {
    const title = lines.find(line => /^# /.test(line)) ?? basename(path);
    let heading = title;
    for (let first = 0; first < lines.length; first += STRIDE) {
      const body = lines.slice(first, first + WINDOW);
      heading = body.findLast(line => /^#{1,6} /.test(line)) ?? heading;
      chunks.push({
        id: chunks.length, path, first: first + 1, last: first + body.length, title, heading,
        pathWords: path.replace(/([a-z])([A-Z])/g, '$1 $2'), body: body.join('\n'),
      });
    }
  }
  index.addAll(chunks);
  return (query, excluded) => index.search(query, {
    combineWith: 'OR', boost: { title: 2.5, heading: 2, pathWords: 1.5, body: 1 },
    filter: hit => !excluded.has(hit.path),
  }).slice(0, LIMIT);
}

function qmdRange(hit, path, document, query) {
  const exact = hit.bestChunk && document.raw.indexOf(hit.bestChunk, Math.max(0, (hit.bestChunkPos ?? 0) - 1));
  if (Number.isInteger(exact) && exact >= 0) {
    const first = document.raw.slice(0, exact).split('\n').length;
    return around(path, first + Math.floor(hit.bestChunk.split('\n').length / 2), document.lines.length);
  }
  const queryWords = new Set(terms(query));
  let best = 0;
  let line = 1;
  for (const [index, text] of document.lines.entries()) {
    const score = new Set(words(text).filter(word => queryWords.has(word))).size;
    if (score > best) { best = score; line = index + 1; }
  }
  return around(path, line, document.lines.length);
}

export async function prepareQmd(project, directory, modulePath, embed) {
  const { createStore } = await import(pathToFileURL(modulePath).href);
  const source = join(directory, 'source');
  mkdirSync(source, { recursive: true });
  const projected = new Map();
  for (const document of project.documents.values()) {
    const path = join(String(projected.size), basename(document.path));
    projected.set(path, document);
    mkdirSync(dirname(join(source, path)));
    writeFileSync(join(source, path), document.raw);
  }
  const store = await createStore({
    dbPath: join(directory, 'index.sqlite'), config: { collections: { docs: { path: source, pattern: '**/*.md' } } },
  });
  try {
    await store.update();
    const collections = await store.listCollections();
    if (collections.length !== 1 || collections[0].active_count !== projected.size) {
      throw Error('QMD corpus size mismatch');
    }
    if (embed) await store.embed({ collection: 'docs' });
  } catch (error) {
    await store.close();
    throw error;
  }
  async function search(query, excluded, mode) {
    const identifier = query.match(identifierPattern)?.[0];
    const keyword = identifier ? '"' + identifier.replace(/[.-]/g, ' ') + '"' : terms(query).join(' ');
    if (!keyword) return [];
    const options = { limit: LIMIT + excluded.size };
    const hits = mode === 'qmd-bm25'
      ? await store.searchLex(keyword, options)
      : await store.search({ ...options, queries: [{ type: 'lex', query: keyword }, { type: 'vec', query }], rerank: false });
    return hits.flatMap(hit => {
      const document = projected.get(hit.displayPath.replace(/^(?:qmd:\/\/)?docs\//, ''));
      if (!document) throw Error('QMD source missing from corpus');
      return excluded.has(document.path) ? [] : [qmdRange(hit, document.path, document, query)];
    }).slice(0, LIMIT);
  }
  return { search, close: () => store.close() };
}
