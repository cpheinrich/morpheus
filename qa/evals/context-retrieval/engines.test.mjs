import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareMiniSearch, prepareRipgrep } from './engines.mjs';

const document = (path, raw) => [path, { path, raw, lines: raw.trimEnd().split('\n') }];
const project = {
  documents: new Map([
    document('.agent/worklog/evidence.md', 'roadmap: EV-26-11-07-08.12.30\nSource evidence.\n'),
    document('docs/spelling.md', '# Synchronize provisioner\nDifferent work EV-26-11-07-08.12.31.\n'),
  ]),
};

test('ripgrep scopes the corpus to the manifest and finds the exact roadmap ID', () => {
  const temp = mkdtempSync(join(tmpdir(), 'retrieval-test-'));
  try {
    const lookup = prepareRipgrep(project, join(temp, 'corpus'));
    const query = 'Work log for EV-26-11-07-08.12.30';
    assert.deepEqual(lookup(query, new Set()), [{ path: '.agent/worklog/evidence.md', first: 1, last: 2 }]);
    assert.deepEqual(lookup(query, new Set(['.agent/worklog/evidence.md'])), []);
  } finally { rmSync(temp, { recursive: true }); }
});

test('MiniSearch returns canonical line windows and applies exclusion before shortlisting', () => {
  const lookup = prepareMiniSearch(project, true);
  const result = lookup('Synchronize provisioner', new Set());
  assert.deepEqual(result.map(({ path, first, last }) => ({ path, first, last })),
    [{ path: 'docs/spelling.md', first: 1, last: 2 }]);
  assert.deepEqual(lookup('Synchronize provisioner', new Set(['docs/spelling.md'])), []);
});

test('MiniSearch tokenizes a roadmap ID as one term across query and document', () => {
  const lookup = prepareMiniSearch(project, false);
  assert.deepEqual(lookup('Work log for EV-26-11-07-08.12.30', new Set()).map(hit => hit.path),
    ['.agent/worklog/evidence.md']);
});
