import { mkdirSync, openSync, closeSync, writeSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, loadProjects, readJson } from './corpus.mjs';
import { buildFrame } from './frame.mjs';
import { budgets, formatResults, scoreResults, validateCases } from './measure.mjs';
import { prepareMiniSearch, prepareQmd, prepareRipgrep } from './engines.mjs';

const CODE = ['corpus.mjs', 'frame.mjs', 'measure.mjs', 'engines.mjs', 'run.mjs'];
const codeHash = () => digest(CODE.map(name => digest(readFileSync(new URL(name, import.meta.url)))).join('\n'));
const privateJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const manifest = projects => projects.map(({ name, provenance, documents }) => ({ name, sources: provenance, documents: documents.size }));
const require = createRequire(import.meta.url);

function groupCounts(cases) {
  const counts = {};
  const groups = {};
  for (const item of cases) {
    const key = item.project + '/' + item.split + '/' + item.kind;
    counts[key] = (counts[key] ?? 0) + 1;
    (groups[item.project + '/' + item.split] ??= new Set()).add(item.group);
  }
  return { counts, groups: Object.fromEntries(Object.entries(groups).map(([key, ids]) => [key, ids.size])) };
}

function frame(configPath, directory, projects) {
  const { exposedPaths, seed } = readJson(configPath);
  if (typeof seed !== 'string' || !seed) throw Error('A fixed seed is required');
  const cases = buildFrame(projects, { seed, exposedPaths });
  validateCases(cases, projects);
  mkdirSync(directory, { mode: 0o700 });
  for (const split of ['dev', 'holdout']) {
    privateJson(join(directory, split + '.json'), cases.filter(item => item.split === split));
  }
  const record = {
    seed, code: codeHash(), config: digest(readFileSync(configPath)), corpora: manifest(projects),
    fixtures: Object.fromEntries(['dev', 'holdout'].map(split =>
      [split, digest(readFileSync(join(directory, split + '.json')))])),
    ...groupCounts(cases),
  };
  privateJson(join(directory, 'frame.json'), record);
  console.log(JSON.stringify(record, null, 2));
}

function selectPilot(cases) {
  const counts = new Map();
  return cases.filter(item => {
    const key = item.project + '/' + item.kind;
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return count < 3;
  });
}

const METHODS = ['ripgrep', 'mini-body', 'mini-context', 'qmd-bm25', 'qmd-hybrid'];

function verifyFreeze(configPath, directory, projects, split) {
  const frozen = readJson(join(directory, 'frame.json'));
  const fixture = join(directory, split + '.json');
  if (frozen.code !== codeHash() || frozen.config !== digest(readFileSync(configPath)) ||
      JSON.stringify(frozen.corpora) !== JSON.stringify(manifest(projects)) ||
      frozen.fixtures[split] !== digest(readFileSync(fixture))) throw Error('Frame or input drift');
  return readJson(fixture);
}

function rotate(methods, index) {
  const offset = index % methods.length;
  return methods.slice(offset).concat(methods.slice(0, offset));
}

async function prepareMethods(project, directory, methods) {
  const search = new Map();
  const setupMs = {};
  for (const [method, build] of [
    ['ripgrep', () => prepareRipgrep(project, join(directory, 'rg'))],
    ['mini-body', () => prepareMiniSearch(project, false)],
    ['mini-context', () => prepareMiniSearch(project, true)],
  ]) {
    if (!methods.includes(method)) continue;
    const start = performance.now();
    search.set(method, build());
    setupMs[method] = performance.now() - start;
  }
  let qmd;
  if (methods.some(method => method.startsWith('qmd-'))) {
    const start = performance.now();
    qmd = await prepareQmd(project, join(directory, 'qmd'), process.env.QMD_MODULE, methods.includes('qmd-hybrid'));
    setupMs.qmd = performance.now() - start;
    for (const method of methods.filter(method => method.startsWith('qmd-'))) {
      search.set(method, (query, excluded) => qmd.search(query, excluded, method));
    }
  }
  return { search, setupMs, close: () => qmd?.close() };
}

async function measure(query, targets, search, documents, exclude, encode) {
  let ranked, error;
  const start = performance.now();
  try { ranked = await search(query, new Set(exclude)); }
  catch (cause) { error = cause.message; ranked = []; }
  const searchMs = performance.now() - start;
  return budgets.map(budget => {
    const packStart = performance.now();
    const response = JSON.stringify(formatResults(ranked, documents, exclude, budget, encode));
    const totalQueryMs = searchMs + performance.now() - packStart;
    return { budget, response, searchMs, totalQueryMs, error, ...scoreResults(JSON.parse(response), targets) };
  });
}

function toolVersions(methods, tokenizerPath) {
  const localRequire = createRequire(tokenizerPath);
  const version = localRequire('../package.json').version;
  if (version !== '1.0.21') throw Error('Use js-tiktoken 1.0.21');
  const versions = { node: process.version, tokenizer: version, model: 'o200k_base',
    miniSearch: readJson(resolve(dirname(require.resolve('minisearch')), '../../package.json')).version };
  if (methods.includes('ripgrep')) versions.ripgrep = execFileSync('rg', ['--version'], { encoding: 'utf8' }).split('\n')[0];
  if (methods.some(method => method.startsWith('qmd-'))) {
    const qmdRequire = createRequire(process.env.QMD_MODULE);
    versions.qmd = qmdRequire('../package.json').version;
    if (versions.qmd !== '2.8.3') throw Error('Use QMD 2.8.3');
  }
  return versions;
}

function verifyDevelopment(output, current) {
  const directory = resolve(process.env.VERIFIED_DEVELOPMENT_RUN);
  const previous = readJson(join(directory, 'run.json'));
  const report = readJson(join(directory, 'verified-report.json'));
  if (previous.split !== 'dev' || !report.verifiedRows ||
      ['code', 'versions', 'methods', 'budgets', 'frame'].some(key =>
        JSON.stringify(previous[key]) !== JSON.stringify(current[key]))) {
    throw Error('Holdout settings differ from the verified development run: ' + output);
  }
}

async function run({ configPath, framePath, output, split, projects, methods }) {
  const pilot = split === 'pilot';
  if (!['pilot', 'dev', 'holdout'].includes(split)) throw Error('Invalid split');
  if (!methods.length || new Set(methods).size !== methods.length || methods.some(method => !METHODS.includes(method))) {
    throw Error('Invalid method list');
  }
  if (split === 'holdout' && !process.env.VERIFIED_DEVELOPMENT_RUN) throw Error('Set VERIFIED_DEVELOPMENT_RUN before opening the holdout');
  const frozenCases = verifyFreeze(configPath, framePath, projects, pilot ? 'dev' : split);
  const cases = pilot ? selectPilot(frozenCases) : frozenCases;
  validateCases(cases, projects);
  if (!cases.length) throw Error('No eligible cases');
  const tokenizerPath = process.env.TOKENIZER_MODULE;
  const versions = toolVersions(methods, tokenizerPath);
  const { getEncoding } = await import(pathToFileURL(tokenizerPath).href);
  const encoding = getEncoding('o200k_base');
  const encode = output => encoding.encode(output, [], []);
  const runRecord = { code: codeHash(), versions, methods, split, budgets, ...groupCounts(cases),
    frame: digest(readFileSync(join(framePath, 'frame.json'))),
    caseIds: pilot ? cases.map(item => item.id) : undefined };
  if (split === 'holdout') verifyDevelopment(output, runRecord);
  mkdirSync(output, { mode: 0o700 });
  privateJson(join(output, 'run.json'), runRecord);
  await recordResponses(projects, cases, methods, output, encode);
}

async function recordProject(project, items, methods, output, encode, fd) {
  const directory = join(output, project.name);
  mkdirSync(directory);
  const engines = await prepareMethods(project, directory, methods);
  privateJson(join(directory, 'setup.json'), engines.setupMs);
  try {
    for (const [index, item] of items.entries()) {
      for (const method of rotate(methods, index)) {
        const results = await measure(item.query, item.targets, engines.search.get(method),
          project.documents, item.exclude, encode);
        for (const result of results) {
          writeSync(fd, JSON.stringify({ case: item.id, project: item.project, group: item.group,
            kind: item.kind, method, firstQuery: index === 0, ...result }) + '\n');
        }
      }
    }
    console.log(project.name + ': ' + items.length + ' cases');
  } finally { await engines.close(); }
}

async function recordResponses(projects, cases, methods, output, encode) {
  const fd = openSync(join(output, 'responses.jsonl'), 'wx', 0o600);
  try {
    for (const project of projects) {
      const items = cases.filter(item => item.project === project.name);
      await recordProject(project, items, methods, output, encode, fd);
    }
  } finally { closeSync(fd); }
}

const [command, input, frames, destination, split, requested] = process.argv.slice(2);
if (!input || !frames || !['frame', 'run'].includes(command)) {
  throw Error('Usage: run.mjs frame CONFIG FRAME_DIR | run CONFIG FRAME_DIR OUTPUT pilot|dev|holdout [METHODS]');
}
const configPath = resolve(input);
const framePath = resolve(frames);
const projects = loadProjects(configPath);
if (command === 'frame') frame(configPath, framePath, projects);
else await run({ configPath, framePath, output: resolve(destination), split, projects,
  methods: requested ? requested.split(',') : METHODS.slice(0, -1) });
