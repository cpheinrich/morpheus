import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { digest, loadProjects } from './corpus.mjs';
import { buildFrame } from './frame.mjs';

test('verified manifests preserve canonical repository names for cross-project PR grouping', () => {
  const directory = mkdtempSync(join(tmpdir(), 'retrieval-corpus-'));
  try {
    const projects = ['one', 'two'].map((name, index) => {
      const repository = 'team/' + name;
      const id = 'EV-26-11-07-08.12.' + (30 + index);
      const root = join(directory, name);
      mkdirSync(join(root, 'roadmap'), { recursive: true });
      mkdirSync(join(root, '.agent/worklog'), { recursive: true });
      const contents = {
        'roadmap/task.md': '---\nid: ' + id + '\ntitle: Cache stable provenance\nprs: [' +
          (index === 0 ? '42' : 'https://github.com/team/one/pull/42') + ']\n---\n',
        '.agent/worklog/log.md': '---\nroadmap: ' + id + '\n---\n\nA separate source explains how artifact generation works.\n',
      };
      const documents = Object.entries(contents).map(([path, raw]) => {
        writeFileSync(join(root, path), raw);
        return { path, sha256: digest(raw) };
      });
      const manifest = join(root, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({ revision: 'a'.repeat(40), documents }));
      return { name, repository, sources: [{ root, manifest }] };
    });
    const config = join(directory, 'input.json');
    writeFileSync(config, JSON.stringify({ projects }));
    const cases = buildFrame(loadProjects(config));
    assert.equal(cases.length, 4);
    assert.equal(new Set(cases.map(item => item.group)).size, 1);
    writeFileSync(join(projects[0].sources[0].root, 'roadmap/task.md'), 'changed');
    assert.throws(() => loadProjects(config), /Source hash mismatch/);
  } finally { rmSync(directory, { recursive: true }); }
});
