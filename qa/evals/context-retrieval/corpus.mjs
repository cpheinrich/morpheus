import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

function readDocument(root, entry) {
  const path = resolve(root, entry.path);
  if (relative(root, path).split(sep).join('/') !== entry.path ||
      !entry.path.endsWith('.md') || entry.path.startsWith('../') ||
      !lstatSync(path).isFile() || realpathSync(path) !== path) {
    throw Error('Invalid manifest path: ' + entry.path);
  }
  const bytes = readFileSync(path);
  if (digest(bytes) !== entry.sha256) throw Error('Source hash mismatch: ' + entry.path);
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const lines = raw.replace(/\r?\n$/, '').split(/\r?\n/);
  return { path: entry.path, raw, lines, sha256: entry.sha256 };
}

export function loadProjects(configPath) {
  const config = readJson(configPath);
  const seen = new Set();
  return config.projects.map(({ name, sources }) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || seen.has(name)) throw Error('Invalid project name: ' + name);
    seen.add(name);
    const documents = new Map();
    const provenance = [];
    for (const { root, manifest } of sources) {
      if (!isAbsolute(root) || !isAbsolute(manifest)) throw Error('Use absolute source and manifest paths');
      const data = readJson(manifest);
      const revision = data.revision ?? data.source?.revision;
      if (!/^[0-9a-f]{40}$/.test(revision ?? '')) throw Error('Invalid source revision');
      provenance.push({ revision, manifestHash: digest(readFileSync(manifest)) });
      const source = realpathSync(root);
      for (const entry of data.documents ?? data.files ?? data.entries) {
        if (documents.has(entry.path)) throw Error('Duplicate source: ' + entry.path);
        documents.set(entry.path, readDocument(source, entry));
      }
    }
    return { name, documents, provenance };
  });
}
