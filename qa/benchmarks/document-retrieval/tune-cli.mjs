import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {originalPath} from './qmd.mjs';
import {recallAt} from './score.mjs';

const [root, configPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath));
const output = join(root, 'development-cli-results.json');
if (existsSync(output)) throw Error('Preserve prior attempts');
const fixtures = JSON.parse(readFileSync(join(root, 'development.json'))).filter(q => q.project === 'evo');
const rows = [];
for (const q of fixtures) {
  const query = q.keywords.replace(/[A-Z]{2}-\d{2}-\d{2}-\d{2}-[\d.]+/g, s => s.replace(/[.-]/g, ' '));
  const start = performance.now();
  const result = spawnSync(join(config.qmdBin, 'qmd'), ['search', query, '--full', '--format', 'json', '-n', '3'],
    {cwd: join(root, 'evo'), env: {...process.env, ...config.qmdEnv}, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  const ms = performance.now() - start;
  let hits = [], error = result.status === 0 ? null : result.error?.message ?? result.stderr;
  try {hits = JSON.parse(result.stdout);} catch (e) {error ??= String(e);}
  const paths = Array.isArray(hits) ? hits.map(h => originalPath(h.file)) : [];
  rows.push({id: q.id, mode: 'native-cli-full3', ms, error, paths,
    recall3: recallAt(q.groups, paths, 3), outputChars: (result.stdout ?? '').length});
}
writeFileSync(output, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({queries: rows.length, failures: rows.filter(r => r.error).length}));
