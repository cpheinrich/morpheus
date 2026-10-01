import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digest } from './score.mjs';

const [repo, revision, destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: node snapshot.mjs REPO REVISION DESTINATION');
const git = args => execFileSync('git', ['-C', repo, ...args], {maxBuffer: 64 * 1024 * 1024});
const sha = git(['rev-parse', revision]).toString().trim();
const paths = git(['ls-tree', '-r', '--name-only', '-z', sha]).toString().split('\0').filter(path =>
  path.endsWith('.md') && (path === 'AGENTS.md' || /^\.agent\/(decisions|learned)(\.md|\/)/.test(path) ||
    path.startsWith('.agent/worklog/') || path.startsWith('hq/product/') || path.startsWith('docs/')));
const files = paths.map(path => {
  const bytes = git(['show', `${sha}:${path}`]);
  const target = path === 'AGENTS.md' ? 'agent-instructions.md' : path;
  mkdirSync(dirname(join(destination, target)), {recursive: true});
  writeFileSync(join(destination, target), bytes);
  return {path: target, bytes: bytes.length, sha256: digest(bytes)};
});
const manifest = {revision: sha, files, bytes: files.reduce((sum, f) => sum + f.bytes, 0)};
writeFileSync(join(destination, 'snapshot.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({revision: sha, files: files.length, bytes: manifest.bytes, sha256: digest(JSON.stringify(manifest))}));
