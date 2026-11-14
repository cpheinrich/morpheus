import {readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {digest, mean, quantile} from './score.mjs';

const [root, destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: node publish.mjs PRIVATE_RUN_DIRECTORY PUBLIC_OUTPUT_DIRECTORY');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const frozen = read(join(root, 'frozen.json'));
if (digest(readFileSync(join(root, 'fixtures.json'))) !== frozen.fixtureSha256) throw new Error('Fixture drift');
const fixtures = read(join(root, 'fixtures.json'));
if (fixtures.length !== 60 || ['lakina', 'evo'].some(p => fixtures.filter(q => q.project === p).length !== 30)) {
  throw new Error('Expected exactly thirty questions per project');
}
const engines = readdirSync(root).filter(f => f.endsWith('-engine.json')).flatMap(f => read(join(root, f)));
const agents = readdirSync(join(root, 'agents')).filter(f => f.endsWith('.result.json')).map(f => read(join(root, 'agents', f)));
if (engines.length !== 300 || agents.length !== 120) throw new Error('Incomplete run: retain partial evidence, do not publish as complete');
const agentKeys = new Set(agents.map(r => r.id + '/' + r.arm));
const engineKeys = new Set(engines.map(r => r.id + '/' + r.mode));
if (agentKeys.size !== 120 || engineKeys.size !== 300) throw new Error('Duplicate observations');
for (const q of fixtures) {
  for (const arm of ['baseline', 'qmd']) if (!agentKeys.has(q.id + '/' + arm)) throw new Error('Missing agent cell');
  for (const mode of ['bm25', 'vector', 'hybrid', 'rerank', 'full']) if (!engineKeys.has(q.id + '/' + mode)) throw new Error('Missing engine cell');
}
const publicEngines = engines.map(({id, project, category, mode, ms, firstQuery, recall5, recall10, mrr, error}) =>
  ({id, project, category, mode, ms, firstQuery, recall5, recall10, mrr, failed: error !== null}));
const publicAgents = agents.map(({id, project, category, arm, order, startedAt, ms, status, recall, toolCalls, toolOutputChars, qmdCalls, usage}) =>
  ({id, project, category, arm, order, startedAt, ms, status, recall, toolCalls, toolOutputChars, qmdCalls, usage}));
const summary = {frozen, corpora: [], engines: [], agents: [], pairs: [], byCategory: [], deliveryBudgets: []};
for (const project of ['lakina', 'evo']) {
  const manifest = read(join(root, project, 'snapshot.json'));
  for (const file of manifest.files) {
    if (file.sha256 && digest(readFileSync(join(root, project, file.path))) !== file.sha256) {
      throw new Error('Frozen corpus changed');
    }
  }
  const indexing = read(join(root, project + '-index.json'));
  summary.corpora.push({project, revision: manifest.revision, files: manifest.files.length, bytes: manifest.bytes,
    snapshotSha256: digest(JSON.stringify(manifest)), updateMs: indexing.updateMs, embedMs: indexing.embedMs,
    chunks: indexing.embed.chunksEmbedded});
  for (const mode of ['bm25', 'vector', 'hybrid', 'rerank', 'full']) {
    const rows = engines.filter(r => r.project === project && r.mode === mode);
    summary.engines.push({project, mode, n: rows.length, recall5: mean(rows.map(r => r.recall5)),
      recall10: mean(rows.map(r => r.recall10)), mrr: mean(rows.map(r => r.mrr)),
      medianMs: quantile(rows.map(r => r.ms), 0.5), p95Ms: quantile(rows.map(r => r.ms), 0.95),
      firstQueryMs: rows.find(r => r.firstQuery).ms, errors: rows.filter(r => r.error !== null).length});
  }
  for (const arm of ['baseline', 'qmd']) {
    const rows = agents.filter(r => r.project === project && r.arm === arm);
    for (const seconds of [15, 30, 60, 120]) summary.deliveryBudgets.push({
      project, arm, seconds, n: rows.length,
      deliveredRecall: mean(rows.map(r => r.status === 'completed' && r.ms <= seconds * 1000 ? r.recall : 0)),
    });
    const usageRows = rows.filter(r => r.usage);
    summary.agents.push({project, arm, n: rows.length, recall: mean(rows.map(r => r.recall)),
      completeEvidence: rows.filter(r => r.recall === 1).length,
      completed: rows.filter(r => r.status === 'completed').length,
      timeouts: rows.filter(r => r.status === 'timeout').length, errors: rows.filter(r => r.status === 'error').length,
      medianMs: quantile(rows.map(r => r.ms), 0.5), p95Ms: quantile(rows.map(r => r.ms), 0.95),
      meanToolCalls: mean(rows.map(r => r.toolCalls)), meanToolOutputChars: mean(rows.map(r => r.toolOutputChars)),
      qmdUsed: rows.filter(r => r.qmdCalls > 0).length, usageRows: usageRows.length,
      medianInputTokens: quantile(usageRows.map(r => r.usage.input_tokens), 0.5),
      medianCachedInputTokens: quantile(usageRows.map(r => r.usage.cached_input_tokens), 0.5),
      medianUncachedInputTokens: quantile(usageRows.map(r => r.usage.input_tokens - r.usage.cached_input_tokens), 0.5),
      medianOutputTokens: quantile(usageRows.map(r => r.usage.output_tokens), 0.5)});
  }
  const pairs = fixtures.filter(q => q.project === project).map(q => {
    const baseline = agents.find(r => r.id === q.id && r.arm === 'baseline');
    const qmd = agents.find(r => r.id === q.id && r.arm === 'qmd');
    return {recallDelta: qmd.recall - baseline.recall, msDelta: qmd.ms - baseline.ms};
  });
  summary.pairs.push({project, n: pairs.length, improved: pairs.filter(p => p.recallDelta > 0).length,
    tied: pairs.filter(p => p.recallDelta === 0).length, worse: pairs.filter(p => p.recallDelta < 0).length,
    meanRecallDelta: mean(pairs.map(p => p.recallDelta)), medianMsDelta: quantile(pairs.map(p => p.msDelta), 0.5),
    msDeltaQ1: quantile(pairs.map(p => p.msDelta), 0.25), msDeltaQ3: quantile(pairs.map(p => p.msDelta), 0.75)});
  for (const category of [...new Set(fixtures.map(q => q.category))]) {
    for (const arm of ['baseline', 'qmd']) {
      const rows = agents.filter(r => r.project === project && r.category === category && r.arm === arm);
      summary.byCategory.push({project, category, arm, n: rows.length, recall: mean(rows.map(r => r.recall)),
        medianMs: quantile(rows.map(r => r.ms), 0.5)});
    }
  }
}
const adjudications = existsSync(join(root, 'adjudications.json')) ? read(join(root, 'adjudications.json')) : [];
const seen = new Set();
for (const entry of adjudications) {
  const key = entry.id + '/' + entry.arm;
  const row = agents.find(r => r.id === entry.id && r.arm === entry.arm);
  if (seen.has(key) || !row || row.status !== 'completed' || row.recall !== entry.strictRecall ||
    !Number.isFinite(entry.auditedRecall) || entry.auditedRecall < 0 || entry.auditedRecall > 1 ||
    !['unlabeled-equivalent', 'missing-required-evidence', 'invalid-quotation', 'irrelevant-quote'].includes(entry.classification)) {
    throw new Error('Invalid post-hoc adjudication');
  }
  seen.add(key);
}
const auditedRecall = row => adjudications.find(a => a.id === row.id && a.arm === row.arm)?.auditedRecall ?? row.recall;
if (existsSync(join(root, 'private-audit.json'))) {
  const audit = read(join(root, 'private-audit.json'));
  if (audit.length !== 120) throw new Error('Incomplete transcript audit');
  const queryModes = {};
  for (const row of audit) for (const mode of row.qmdQueryModes) queryModes[mode] = (queryModes[mode] ?? 0) + 1;
  summary.transcriptAudit = {
    runs: audit.length, invalidSourceQuotes: audit.flatMap(r => r.citations).filter(c => !c.validSourceQuote).length,
    qmdModeViolations: audit.reduce((sum, r) => sum + r.qmdPolicyViolations, 0),
    otherMcpCalls: audit.reduce((sum, r) => sum + r.otherMcpCalls.length, 0), queryModes,
  };
}
summary.postHoc = {
  note: 'Author audit, not blind ground truth. Original frozen scores are unchanged.',
  adjudications: adjudications.map(({id, arm, strictRecall, auditedRecall, classification}) =>
    ({id, arm, strictRecall, auditedRecall, classification})),
  agents: ['lakina', 'evo'].flatMap(project => ['baseline', 'qmd'].map(arm => {
    const rows = agents.filter(r => r.project === project && r.arm === arm);
    return {project, arm, n: rows.length, recall: mean(rows.map(auditedRecall)),
      completeEvidence: rows.filter(r => auditedRecall(r) === 1).length,
      unadjudicatedCompletedMisses: rows.filter(r => r.status === 'completed' && r.recall < 1 &&
        !seen.has(r.id + '/' + r.arm)).length};
  })),
};
mkdirSync(destination, {recursive: true});
writeFileSync(join(destination, 'measurements.json'), JSON.stringify({engines: publicEngines, agents: publicAgents}, null, 2) + '\n');
writeFileSync(join(destination, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
