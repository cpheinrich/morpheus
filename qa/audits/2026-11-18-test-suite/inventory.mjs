#!/usr/bin/env node
// Reproducible inventory behind qa/audits/2026-11-18-test-suite.md.
//
//   node qa/audits/2026-11-18-test-suite/inventory.mjs            # rewrite ledger.tsv
//   node qa/audits/2026-11-18-test-suite/inventory.mjs --check    # fail when it would change
//
// Counts come from the audited Git tree. A
// *declaration* is one `it(`/`test(`/`def test_` in source; a *runtime instance* is what the
// runner reports after `.each` expansion and is joined from `runtime.tsv`, which records where
// each number came from. Ratings are joined from `ratings.tsv` and are a human judgement.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const baseline = '9c4c3e58539f75d0bcabc545bfa9df3346488c30';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const tracked = git('ls-tree', '-r', '--name-only', '-z', baseline).split('\0').filter(Boolean);

// First match wins. `lane` is the CI job that executes the file on a pull request, or `none`.
const SUITES = [
  [/^tests\/browser\/[^/]+\.spec\.ts$/, 'playwright', 'qa-browser'],
  [/^tests\/.+\.test\.tsx?$/, 'root-vitest', 'node / check'],
  [/^tests\/factory-fleet-firestore\.test\.mjs$/, 'node:test+firestore-emulator', 'factory'],
  [/^tests\/firestore-rules\.test\.mjs$/, 'node:test+firestore-emulator', 'none'],
  [/^tests\/artifacts\/test_.*_mutants\.py$/, 'python-script', 'none'],
  [/^tests\/artifacts\/test_.+\.py$/, 'python-script', 'artifact-abi'],
  [/^tests\/(ios_entitlements_test|signing-lock\.test|upload-receipt\.test)\.py$/, 'python-via-root-vitest', 'node / check'],
  [/^\.github\/actions\/ios-simulator\/simulator\.test\.mjs$/, 'node:test-via-root-vitest', 'node / check'],
  [/^plugins\/factory\/tests\/.+\.test\.mjs$/, 'factory-bridge node:test', 'factory'],
  [/^plugins\/factory\/src\/host\/tests\/.+\.test\.ts$/, 'factory-host vitest', 'factory'],
  [/^plugins\/factory\/src\/host\/tests\/test_.+\.py$/, 'factory-host unittest', 'factory'],
  [/^plugins\/factory\/src\/host\/reporting\/tests\/.+\.test\.mjs$/, 'factory-host node:test', 'factory'],
  [/^qa\/evals\/workflow-repair\/test_.+\.py$/, 'unittest-via-root-vitest', 'node / check'],
  [/^qa\/evals\/.+\.test\.mjs$/, 'node:test', 'none'],
  [/^qa\/prototypes\/.+\.test\.mjs$/, 'node:test', 'none'],
];

const count = (text, pattern) => (text.match(pattern) ?? []).length;

function measure(path, text) {
  if (path.endsWith('.py')) {
    return {
      declarations: count(text, /^\s*(?:async\s+)?def test_\w+\s*\(/gm),
      each: count(text, /self\.subTest\(|@pytest\.mark\.parametrize/g),
      assertions: count(text, /\bassert\b|self\.assert\w+\(|self\.fail\(|\bexpect\w*\(/g),
      absence: count(text, /assertFalse\(.*exists|assertNotIn\(/g),
      sourceText: 0,
      mockCalls: count(text, /assert_called|assert_not_called|call_args/g),
    };
  }
  return {
    // `it(`, `test(`, with any modifier chain; `.each` tables are one declaration each.
    declarations: count(text, /^\s*(?:it|test)(?:\.(?:skip|only|todo|concurrent|sequential|fails))*(?:\.(?:skipIf|runIf)\([^)]*\))?(?:\.each)?\s*[(`<]/gm),
    each: count(text, /^\s*(?:it|test|describe)(?:\.\w+)*\.each\b/gm),
    assertions: count(text, /\bexpect(?:\.\w+)?\(|\bassert(?:\.\w+)?\(|\bassert(?:Succeeds|Fails)\(|\.rejects\b|\.throws\(/g),
    // Shapes the prune method asks about. They nominate a file for reading; they prove nothing.
    absence: count(text, /existsSync\([^\n]*\)\)?\s*\.toBe\(false\)|assert\.equal\(existsSync\([^\n]*,\s*false\)|\.not\.toContain\(|\.not\.toMatch\(|assert\.doesNotMatch\(/g),
    sourceText: count(text, /readFileSync\(|readFile\(/g),
    mockCalls: count(text, /toHaveBeenCalled|toHaveBeenNthCalledWith|\.mock\.calls/g),
  };
}

const tsv = name => readFileSync(join(here, name), 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));
const runtime = new Map(tsv('runtime.tsv').map(([path, instances, seconds, source]) => [path, { instances, seconds, source }]));
const ratingRules = tsv('ratings.tsv').map(([pattern, rating, depth, note]) => ({ pattern, rating, depth, note }));
const rate = path => ratingRules.find(rule => rule.pattern === path) ?? ratingRules.find(rule => path.startsWith(rule.pattern));

const rows = [];
for (const path of tracked) {
  const suite = SUITES.find(([pattern]) => pattern.test(path));
  if (!suite) continue;
  const m = measure(path, git('show', `${baseline}:${path}`));
  const run = runtime.get(path) ?? { instances: '', seconds: '', source: '' };
  const rating = rate(path);
  if (!rating) throw new Error(`no rating for ${path}`);
  rows.push([path, suite[1], suite[2], m.declarations, m.each, run.instances, run.seconds, run.source, m.assertions,
    m.declarations ? (m.assertions / m.declarations).toFixed(1) : '', m.absence, m.sourceText, m.mockCalls, rating.rating, rating.depth, rating.note]);
}
rows.sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

const header = ['path', 'runner', 'pr_lane', 'declarations', 'each_tables', 'runtime_instances', 'case_seconds', 'runtime_source', 'assertions',
  'assertions_per_declaration', 'absence_shapes', 'source_reads', 'mock_call_assertions', 'rating', 'review_depth', 'note'];
const ledger = [header, ...rows].map(row => row.join('\t')).join('\n') + '\n';
const target = join(here, 'ledger.tsv');

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== ledger) { console.error('ledger.tsv is stale; rerun inventory.mjs'); process.exit(1); }
} else {
  writeFileSync(target, ledger);
}

const sum = (list, index) => list.reduce((total, row) => total + (Number(row[index]) || 0), 0);
const group = (index, label) => {
  const keys = [...new Set(rows.map(row => row[index]))].sort();
  console.log(`\n${label}\tfiles\tdeclarations\truntime_instances\tcase_seconds`);
  for (const key of keys) {
    const list = rows.filter(row => row[index] === key);
    console.log([key, list.length, sum(list, 3), sum(list, 5), sum(list, 6).toFixed(1)].join('\t'));
  }
};
console.log(`files\t${rows.length}\tdeclarations\t${sum(rows, 3)}\truntime_instances\t${sum(rows, 5)}`);
group(2, 'pr_lane');
group(1, 'runner');
group(13, 'rating');
group(14, 'review_depth');
