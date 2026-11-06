import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import MiniSearch from 'minisearch';
import matter from 'gray-matter';
import {sourceWindow} from './history-retrieval.mjs';

// Question words carry no topic. Dropping them matters more here than in plain
// MiniSearch because sections are short, so one "should" can outrank the topic.
const STOP = new Set(('a an and are as at be been being but by can could did do does for from has have how ' +
  'i if in into is it its of on or our should so that the their then there these they this those to ' +
  'use used was we were what when where which while who why will with would you evo lakina').split(' '));
const ID = /\b[A-Z]{2,4}-(?:[A-Z]{1,2}-)?\d{2,4}(?:[-.][0-9A-Z]{2,})*\b/g;
const compactId = id => id.toLowerCase().replace(/[^a-z0-9]/g, '');

export function recordType(path) {
  if (/^\.agent\/decisions(\.md|\/)/.test(path)) return 'decision';
  if (path.startsWith('.agent/learned')) return 'learned';
  if (path.startsWith('.agent/worklog/')) return 'worklog';
  if (path.startsWith('hq/product/roadmap/')) return path.endsWith('README.md') ? 'index' : 'roadmap';
  if (/^hq\/product\/(goals|requests)\//.test(path)) return 'goal';
  if (path.startsWith('docs/')) return 'doc';
  return path === 'agent-instructions.md' ? 'instructions' : 'product';
}

const isoDay = value => value instanceof Date ? value.toISOString().slice(0, 10)
  : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

// Recorded date, preferring what the record says over what its name implies.
export function recordDate(path, data) {
  const fromId = typeof data.id === 'string' && data.id.match(/-(\d{2})-(\d{2})-(\d{2})-\d{2}\.\d{2}\.\d{2}$/);
  return isoDay(data.updated) ?? isoDay(data.date) ?? isoDay(data.created)
    ?? path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? (fromId ? `20${fromId[1]}-${fromId[2]}-${fromId[3]}` : null);
}

// Long records are indexed by heading so a match lands on the relevant rule,
// not on the first line of a 70 KB decisions file.
export function sections(body, minChars = 2500) {
  const lines = body.split('\n');
  if (body.length < minChars) return [{heading: '', startLine: 1, text: body}];
  const out = []; let start = 0, heading = '', fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^#{1,3}\s/.test(line) && i > start) {
      out.push({heading, startLine: start + 1, text: lines.slice(start, i).join('\n')});
      start = i;
    }
    if (!fence && /^#{1,3}\s/.test(line)) heading = line.replace(/^#+\s*/, '');
  });
  out.push({heading, startLine: start + 1, text: lines.slice(start).join('\n')});
  // A bold-lead paragraph or bullet is the unit of a decisions/learned file without headings.
  return out.flatMap(s => s.text.length > 6000 ? paragraphs(s) : [s]).filter(s => s.text.trim());
}

function paragraphs(section) {
  const lines = section.text.split('\n'), out = []; let start = 0;
  lines.forEach((line, i) => {
    if (i > start && (/^[-*]\s+\*\*[^*]/.test(line) || /^\*\*[^*]/.test(line) && lines[i - 1].trim() === '')) {
      out.push({heading: section.heading, startLine: section.startLine + start, text: lines.slice(start, i).join('\n')});
      start = i;
    }
  });
  out.push({heading: section.heading, startLine: section.startLine + start, text: lines.slice(start).join('\n')});
  return out;
}

// An identifier is one token. Split into its date fields it would match every
// record written that day and drown the one record it names.
export function tokenize(text) {
  const words = text.replace(ID, ' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return [...words, ...(text.match(ID) ?? []).map(compactId)];
}
const term = t => STOP.has(t) || t.length < 2 ? null : t;

// Historical wording asks what happened; everything else asks what holds now.
export function queryIntent(question) {
  const s = question.toLowerCase();
  if (/\b(when did|originally|initially|at first|at the time|previously|used to|what happened|why did|history of|earlier|first (shipped|added|built|tried)|went wrong|root cause|what failed|what broke|how was .* (fixed|resolved|diagnosed))\b/.test(s)
    || /\b20\d\d-\d\d\b/.test(s)) return 'historical';
  return 'current';
}

export const DEFAULT_META = {
  limit: 4, maxChars: 2600, linkedMax: 2, linkedChars: 800, totalChars: 12000,
  boost: {title: 3, heading: 2, ids: 4, path: 1.5, text: 1}, prefix: 0, fuzzy: 0, rank: 'hybrid', unitWeight: 1,
  prior: {
    current: {decision: 1.3, learned: 1.15, doc: 1.2, roadmap: 1.1, goal: 1, worklog: 1, product: 1, index: .5, instructions: .8},
    historical: {decision: 1, learned: 1.1, doc: 1, roadmap: 1, goal: 1, worklog: 1.25, product: 1, index: .5, instructions: .8},
  },
  recency: {current: .15, historical: 0}, superseded: .75,
};

export function createMetaRetriever(corpus, options = {}) {
  const o = {...DEFAULT_META, ...options};
  const manifest = JSON.parse(readFileSync(join(corpus, 'snapshot.json')));
  const started = performance.now();
  const docs = new Map(), units = [], byId = new Map(), worklogsFor = new Map();
  for (const f of manifest.files) {
    const raw = readFileSync(join(corpus, f.path), 'utf8');
    let data = {}, content = raw;
    try {({data, content} = matter(raw));} catch {}
    const offset = raw.slice(0, raw.length - content.length).split('\n').length - 1;
    const type = recordType(f.path), date = recordDate(f.path, data);
    const title = String(data.title ?? content.match(/^#\s+(.+)$/m)?.[1] ?? '');
    const doc = {path: f.path, raw, type, date, title, id: typeof data.id === 'string' ? data.id : null,
      status: typeof data.status === 'string' ? data.status : typeof data.outcome === 'string' ? data.outcome : null,
      roadmap: typeof data.roadmap === 'string' ? data.roadmap : null, summary: String(data.summary ?? '')};
    docs.set(f.path, doc);
    if (doc.id) byId.set(doc.id, f.path);
    if (doc.roadmap) worklogsFor.set(doc.roadmap, [...(worklogsFor.get(doc.roadmap) ?? []), f.path]);
    for (const s of sections(content)) units.push({id: units.length, path: f.path, heading: s.heading,
      startLine: s.startLine + offset, text: s.text,
      title: [title, doc.summary].join(' '), ids: [doc.id, doc.roadmap, ...(s.text.match(ID) ?? [])].filter(Boolean).join(' '),
      pathText: f.path.replace(/\.md$/, '').replace(/[/_.-]+/g, ' ')});
  }
  const dates = [...docs.values()].map(d => d.date).filter(Boolean).sort();
  const age = date => !date || dates.length < 2 ? 0 : (dates.indexOf(date) / (dates.length - 1));
  const fields = ['title', 'heading', 'ids', 'pathText', 'text'];
  const unitIndex = new MiniSearch({fields, storeFields: [], tokenize, processTerm: term});
  unitIndex.addAll(units);
  // Whole records rank; sections only anchor the window. Each unit alone lacks the
  // vocabulary spread across its record, which cost recall when units ranked directly.
  const docList = [...docs.values()];
  const docIndex = new MiniSearch({fields, storeFields: [], tokenize, processTerm: term});
  docIndex.addAll(docList.map((d, id) => ({id, title: d.title + ' ' + d.summary,
    heading: units.filter(u => u.path === d.path).map(u => u.heading).join(' '),
    ids: [...new Set(units.filter(u => u.path === d.path).map(u => u.ids))].join(' '),
    pathText: units.find(u => u.path === d.path)?.pathText ?? '', text: d.raw})));
  const indexMs = performance.now() - started;

  function linked(doc) {
    if (doc.type === 'worklog' && doc.roadmap && byId.has(doc.roadmap)) return [byId.get(doc.roadmap)];
    if (doc.type === 'roadmap' && doc.id) return [...(worklogsFor.get(doc.id) ?? [])]
      .sort((a, b) => String(docs.get(b).date).localeCompare(String(docs.get(a).date)));
    return [];
  }
  const header = doc => ({path: doc.path, type: doc.type, date: doc.date, status: doc.status, id: doc.id ?? doc.roadmap});

  return {
    setup: {indexMs, documents: docs.size, units: units.length},
    retrieve(question) {
      const start = performance.now();
      const intent = queryIntent(question);
      const prior = o.prior[intent];
      const weight = d => (prior[d.type] ?? 1) * (1 + o.recency[intent] * age(d.date))
        * (intent === 'current' && /supersed|replaced|cancel|dropped|wontfix/i.test(d.status ?? '') ? o.superseded : 1);
      const options = {boost: {...o.boost, pathText: o.boost.path}, combineWith: 'OR',
        prefix: o.prefix ? t => t.length >= o.prefix : false, fuzzy: o.fuzzy, processTerm: term};
      const unitHits = unitIndex.search(question, {...options, boostDocument: id => weight(docs.get(units[id].path))});
      const bestUnit = new Map();
      for (const h of unitHits) if (!bestUnit.has(units[h.id].path)) bestUnit.set(units[h.id].path, h);
      let ranked;
      if (o.rank === 'unit') ranked = [...bestUnit.keys()];
      else {
        const docHits = docIndex.search(question, {...options, boostDocument: id => weight(docList[id])});
        const top = docHits[0]?.score || 1, topUnit = unitHits[0]?.score || 1;
        const score = new Map(docHits.map(h => [docList[h.id].path, h.score / top]));
        if (o.rank === 'hybrid') for (const [path, h] of bestUnit) score.set(path, (score.get(path) ?? 0) + o.unitWeight * h.score / topUnit);
        ranked = [...score].sort((a, b) => b[1] - a[1]).map(([path]) => path);
      }
      // A named record is a lookup, not a relevance guess: its owner comes first.
      const named = (question.match(ID) ?? []).map(id => byId.get(id)).filter(Boolean);
      ranked = [...new Set([...named, ...ranked])];
      const primary = ranked.slice(0, o.limit).map(path => bestUnit.has(path) ? units[bestUnit.get(path).id]
        : units.find(u => u.path === path));
      const seen = new Set(primary.map(u => u.path));
      const passages = primary.map(u => {
        const w = sourceWindow(u.text, question, o.maxChars);
        return {...header(docs.get(u.path)), heading: u.heading || null, fromLine: u.startLine + w.fromLine - 1, text: w.text};
      });
      // Bundle the canonical record with its narrative (or the reverse), bounded so
      // the whole prompt never exceeds the plain arm's character budget.
      let used = passages.reduce((n, p) => n + p.text.length, 0), added = 0;
      for (const u of primary) for (const path of linked(docs.get(u.path))) {
        if (added >= o.linkedMax || seen.has(path)) continue;
        const d = docs.get(path), room = Math.min(o.linkedChars, o.totalChars - used);
        if (room < 200) continue;
        const text = d.raw.slice(0, room);
        seen.add(path); added++; used += text.length;
        passages.push({...header(d), heading: null, fromLine: 1, linkedFrom: u.path, text});
      }
      return {mode: 'prefetch-meta', intent, ms: performance.now() - start, passages};
    },
  };
}

// The prior study's control: whole documents, path as title, the same window.
export function createPlainRetriever(corpus, {limit = 4, maxChars = 3000} = {}) {
  const manifest = JSON.parse(readFileSync(join(corpus, 'snapshot.json')));
  const started = performance.now();
  const docs = manifest.files.map(f => ({id: f.path, title: f.path, text: readFileSync(join(corpus, f.path), 'utf8')}));
  const byPath = new Map(docs.map(d => [d.id, d]));
  const mini = new MiniSearch({fields: ['title', 'text'], storeFields: [], searchOptions: {boost: {title: 2}}});
  mini.addAll(docs);
  const indexMs = performance.now() - started;
  return {
    setup: {indexMs, documents: docs.length, units: docs.length},
    retrieve(question) {
      const start = performance.now();
      const passages = mini.search(question).slice(0, limit).map(r =>
        ({path: r.id, ...sourceWindow(byPath.get(r.id).text, question, maxChars)}));
      return {mode: 'prefetch-mini', ms: performance.now() - start, passages};
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, mode, question] = process.argv.slice(2);
  const r = mode === 'prefetch-meta' ? createMetaRetriever(corpus) : createPlainRetriever(corpus);
  console.log(JSON.stringify(r.retrieve(question)));
}
