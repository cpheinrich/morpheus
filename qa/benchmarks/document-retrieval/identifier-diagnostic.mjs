import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {openStore, originalPath} from './qmd.mjs';
import {recallAt} from './score.mjs';

const [root, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node identifier-diagnostic.mjs PRIVATE_ROOT OUTPUT_JSON');
const fixtures = JSON.parse(readFileSync(join(root, 'fixtures.json'), 'utf8'));
const rows = [];
for (const project of ['lakina', 'evo']) {
  const store = await openStore(root, project);
  try {
    for (const q of fixtures.filter(q => q.project === project && q.category === 'exact')) {
      const id = q.keywords.replaceAll('"', '');
      for (const [variant, query] of [
        ['quoted', q.keywords], ['unquoted', id], ['spaced-phrase', '"' + id.replace(/[.-]/g, ' ') + '"'],
      ]) {
        const start = performance.now();
        const hits = await store.searchLex(query, {limit: 10});
        rows.push({id: q.id, project, variant, ms: performance.now() - start,
          recall5: recallAt(q.groups, hits.map(h => originalPath(h.displayPath)), 5),
          recall10: recallAt(q.groups, hits.map(h => originalPath(h.displayPath)), 10)});
      }
    }
  } finally { await store.close(); }
}
writeFileSync(output, JSON.stringify({postHoc: true, rows}, null, 2) + '\n');
console.log(JSON.stringify(rows));
