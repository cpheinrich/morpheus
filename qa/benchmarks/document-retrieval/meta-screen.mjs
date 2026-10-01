import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMetaRetriever, createPlainRetriever} from './meta-retrieval.mjs';
import {digest, normalize, mean, quantile} from './score.mjs';

// A group is available in the prompt only when a returned window from one of its
// sources contains a quotable fragment, not merely when the file was named.
export function fragments(text) {
  return normalize(text).split(/(?<=[.!?:;])\s+|\s+-\s+|\s*\|\s*/).map(normalize).filter(f => f.length >= 30);
}

export function scorePassages(groups, passages) {
  const windows = passages.map(p => ({path: p.path, text: normalize(p.text)}));
  const doc = groups.filter(g => g.some(s => windows.some(w => w.path === s.path))).length / groups.length;
  const window = groups.filter(g => g.some(s => windows.some(w => w.path === s.path &&
    fragments(s.text ?? s.quote ?? '').some(f => w.text.includes(f))))).length / groups.length;
  return {docRecall: doc, windowRecall: window, chars: passages.reduce((n, p) => n + JSON.stringify(p).length, 0),
    passages: passages.length};
}

export function screen(root, fixtures, arms) {
  const rows = [], setup = [];
  for (const corpus of [...new Set(fixtures.map(q => q.corpus))]) {
    for (const [arm, spec] of Object.entries(arms)) {
      const make = spec.mode === 'meta' ? createMetaRetriever : createPlainRetriever;
      const retriever = make(join(root, corpus), spec.options ?? {});
      let first = true;
      for (const q of fixtures.filter(x => x.corpus === corpus)) {
        const r = retriever.retrieve(q.question);
        rows.push({id: q.id, project: q.project, arm, intent: r.intent ?? null, ms: r.ms, cold: first,
          ...scorePassages(q.groups, r.passages)});
        first = false;
      }
      setup.push({corpus, arm, ...retriever.setup});
    }
  }
  return {rows, setup};
}

export function summarize(rows) {
  const keys = [...new Set(rows.map(r => `${r.project}\t${r.arm}`))];
  return keys.map(k => {
    const [project, arm] = k.split('\t'), rs = rows.filter(r => r.project === project && r.arm === arm);
    const warm = rs.filter(r => !r.cold).map(r => r.ms);
    return {project, arm, n: rs.length, docRecall: mean(rs.map(r => r.docRecall)),
      windowRecall: mean(rs.map(r => r.windowRecall)), fullWindow: rs.filter(r => r.windowRecall === 1).length,
      medianWarmMs: quantile(warm, .5), p95WarmMs: quantile(warm, .95),
      coldMs: rs.find(r => r.cold)?.ms ?? null, medianChars: quantile(rs.map(r => r.chars), .5)};
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, fixtureFile, configFile, output] = process.argv.slice(2);
  if (!output) throw Error('Usage: node meta-screen.mjs PRIVATE_ROOT FIXTURES CONFIG OUTPUT');
  const fixtureBytes = readFileSync(fixtureFile), configBytes = readFileSync(configFile);
  const {rows, setup} = screen(root, JSON.parse(fixtureBytes), JSON.parse(configBytes).arms);
  const result = {fixtureSha256: digest(fixtureBytes), configSha256: digest(configBytes), setup, summary: summarize(rows), rows};
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.table(result.summary);
  console.table(setup);
}
