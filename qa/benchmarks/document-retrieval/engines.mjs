import {copyFileSync, existsSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest} from './score.mjs';

const [root] = process.argv.slice(2);
if (!root) throw new Error('Usage: node engines.mjs PRIVATE_RUN_DIRECTORY');
const frozen = {
  timestamp: new Date().toISOString(),
  fixtureSha256: digest(readFileSync(join(root, 'fixtures.json'))),
  protocolSha256: digest(readFileSync(new URL('./protocol.md', import.meta.url))),
};
if (existsSync(join(root, 'frozen.json'))) throw new Error('Do not overwrite a frozen run');
writeFileSync(join(root, 'frozen.json'), JSON.stringify(frozen, null, 2));
console.log(JSON.stringify(frozen));
for (const project of ['lakina', 'evo']) {
  for (const mode of ['bm25', 'vector', 'hybrid', 'rerank', 'full']) {
    const database = join(root, project + '-' + mode + '.sqlite');
    if (existsSync(database)) throw new Error('Refusing to reuse a mode database');
    copyFileSync(join(root, project + '.sqlite'), database);
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./qmd.mjs', import.meta.url)), 'evaluate', root, project, mode,
    ], {env: process.env, timeout: 900000, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    writeFileSync(join(root, project + '-' + mode + '-engine.stdout'), result.stdout ?? '');
    writeFileSync(join(root, project + '-' + mode + '-engine.stderr'), result.stderr ?? '');
    console.log(JSON.stringify({project, mode, status: result.status, error: result.error?.message}));
    if (result.status !== 0) throw new Error('Engine subprocess failed; retain partial evidence');
  }
}
