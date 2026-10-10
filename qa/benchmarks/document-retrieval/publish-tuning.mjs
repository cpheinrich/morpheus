import {readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {digest, mean, quantile, normalize} from './score.mjs';
import {scoreTimedEvidence, outputText} from './evidence-timing.mjs';

const [root, destination] = process.argv.slice(2);
if (!destination) throw Error('Usage: node publish-tuning.mjs PRIVATE_ROOT PUBLIC_DESTINATION');
const read = path => JSON.parse(readFileSync(path));
const pick = (row, keys) => Object.fromEntries(keys.map(k => [k, row[k]]));
const median = values => quantile(values, .5);
const manifest = read(join(root, 'evo', 'snapshot.json'));
for (const file of manifest.files) {
  if (digest(readFileSync(join(root, 'evo', file.path))) !== file.sha256) throw Error('Snapshot drift');
}
const allowed = new Set(manifest.files.map(f => f.path));
const sourceText = path => allowed.has(path) ? readFileSync(join(root, 'evo', path), 'utf8') : null;
const metrics = ['id', 'arm', 'repeat', 'order', 'ms', 'status', 'recall', 'validCitations',
  'invalidCitations', 'groupTimes', 'evidenceMs', 'firstToolMs', 'retrievalMs', 'toolCalls',
  'toolOutputChars', 'qmdCalls', 'qmdCliCalls', 'qmdDatabaseErrors'];
const all = [];
const receipts = [];
const adjudications = existsSync(join(root, 'adjudications.json')) ? read(join(root, 'adjudications.json')) : [];
const consumed = new Set();
const publicAdjudications = [];
const stages = ['pilot', 'pilot-cli', 'validation'];
if (existsSync(join(root, 'validation-interrupted'))) stages.push('validation-interrupted');
for (const name of stages) {
  const directory = join(root, name);
  const config = read(join(directory, 'config.json'));
  const bytes = readFileSync(join(root, config.fixture));
  if (digest(bytes) !== config.fixtureSha256) throw Error('Fixture drift');
  const fixtures = JSON.parse(bytes);
  const files = readdirSync(directory).filter(f => f.endsWith('.result.json'));
  if (name !== 'validation-interrupted' && files.length !== fixtures.length * config.arms.length * config.repeats) throw Error('Incomplete run: ' + name);
  const seen = new Set();
  for (const file of files) {
    const row = read(join(directory, file));
    const q = fixtures.find(q => q.id === row.id);
    const key = `${row.id}-${row.arm}-${row.repeat}`;
    if (!q || !config.arms.includes(row.arm) || row.repeat < 0 || row.repeat >= config.repeats || seen.has(key)) throw Error('Invalid run key');
    seen.add(key);
    const prefix = join(directory, file.replace(/\.result\.json$/, ''));
    const events = read(prefix + '.events.json');
    const answer = row.status === 'completed' ? read(prefix + '.answer.json') : {citations: []};
    const tools = events.filter(e => e.event.type === 'item.completed' &&
      ['command_execution', 'mcp_tool_call'].includes(e.event.item?.type)).map(e => e.event.item);
    const score = scoreTimedEvidence(q.groups, answer.citations, events, sourceText);
    const adjustedGroups = q.groups.map(group => [...group]);
    const matches = adjudications.filter(a => a.stage === name && a.id === row.id && a.arm === row.arm && a.repeat === row.repeat);
    if (matches.length > 1) throw Error('Duplicate adjudication');
    for (const a of matches) {
      if (row.status !== 'completed' || !a.additions?.length || !a.reason) throw Error('Invalid adjudication');
      for (const added of a.additions) {
        const source = sourceText(added.path);
        if (!Number.isInteger(added.group) || !adjustedGroups[added.group] || typeof added.quote !== 'string' ||
            normalize(added.quote).length < 30 || source === null || !normalize(source).includes(normalize(added.quote)) ||
            !answer.citations.some(c => c.path === added.path && c.quote === added.quote)) throw Error('Invalid adjudicated source');
        adjustedGroups[added.group].push({path: added.path, text: added.quote});
      }
      consumed.add(a);
    }
    const audited = scoreTimedEvidence(adjustedGroups, answer.citations, events, sourceText);
    if (matches.length) publicAdjudications.push({stage: name, id: row.id, arm: row.arm, repeat: row.repeat,
      strictRecall: score.recall, auditedRecall: audited.recall, classification: 'author-reviewed-alternative'});
    all.push({stage: name, ...pick({...row, ...score,
      toolOutputChars: tools.reduce((n,t) => n + outputText(t).length, 0),
      qmdDatabaseErrors: tools.filter(t => /SQLITE_CANTOPEN|SQLITE_READONLY|SQLITE_BUSY/.test(t.aggregated_output ?? '')).length,
      qmdCliCalls: tools.filter(t => t.type === 'command_execution' && /\bqmd\s+(search|query|vsearch|get|multi-get)\b/.test(t.command ?? '')).length}, metrics),
      auditedRecall: audited.recall, auditedEvidenceMs: audited.evidenceMs, auditedGroupTimes: audited.groupTimes,
      inputTokens: row.usage?.input_tokens ?? null,
      cachedInputTokens: row.usage?.cached_input_tokens ?? null,
      outputTokens: row.usage?.output_tokens ?? null});
  }
  receipts.push({stage: name, fixtureSha256: digest(bytes), configSha256: digest(readFileSync(join(directory, 'config.json'))),
    model: config.model, effort: config.effort, questions: fixtures.length, groups: fixtures.reduce((n,q) => n + q.groups.length, 0),
    arms: config.arms, repeats: config.repeats, frozenAt: config.timestamp,
    completedRows: files.length, interrupted: name === 'validation-interrupted'});
}
if (consumed.size !== adjudications.length) throw Error('Unknown adjudication run');
const validation = all.filter(r => r.stage === 'validation');
const summaries = [...new Set(all.map(r => `${r.stage}/${r.arm}`))].map(key => {
  const rs = all.filter(r => `${r.stage}/${r.arm}` === key);
  return {key, n: rs.length, recall: mean(rs.map(r => r.recall)), completeEvidence: rs.filter(r => r.recall === 1).length,
    timedEvidence: rs.filter(r => r.evidenceMs !== null).length,
    auditedRecall: mean(rs.map(r => r.auditedRecall)), auditedCompleteEvidence: rs.filter(r => r.auditedRecall === 1).length,
    auditedTimedEvidence: rs.filter(r => r.auditedEvidenceMs !== null).length,
    errors: rs.filter(r => r.status !== 'completed').length,
    qmdDatabaseErrors: rs.reduce((n,r) => n + r.qmdDatabaseErrors, 0),
    medianMs: median(rs.map(r => r.ms)), p95Ms: quantile(rs.map(r => r.ms), .95),
    medianEvidenceCappedMs: median(rs.map(r => r.evidenceMs ?? 120000)),
    medianObservedEvidenceMs: median(rs.map(r => r.evidenceMs).filter(x => x !== null)),
    medianAuditedEvidenceCappedMs: median(rs.map(r => r.auditedEvidenceMs ?? 120000)),
    medianFirstToolNotificationMs: median(rs.map(r => r.firstToolMs).filter(x => x !== null)),
    meanToolCalls: mean(rs.map(r => r.toolCalls)), medianOutputChars: median(rs.map(r => r.toolOutputChars)),
    medianInputTokens: median(rs.map(r => r.inputTokens).filter(x => x !== null)),
    medianUncachedTokens: median(rs.filter(r => r.inputTokens !== null && r.cachedInputTokens !== null).map(r => r.inputTokens - r.cachedInputTokens)),
    evidenceByDeadline: [5000, 10000, 15000, 20000, 30000, 60000, 120000].map(ms => ({ms,
      recall: mean(rs.map(r => r.groupTimes.filter(t => t !== null && t <= ms).length / r.groupTimes.length))})),
    auditedEvidenceByDeadline: [5000, 10000, 15000, 20000, 30000, 60000, 120000].map(ms => ({ms,
      recall: mean(rs.map(r => r.auditedGroupTimes.filter(t => t !== null && t <= ms).length / r.auditedGroupTimes.length))})),
  };
});
const pairs = validation.filter(r => r.arm === 'baseline').map(b => {
  const q = validation.find(r => r.id === b.id && r.repeat === b.repeat && r.arm === 'cli');
  if (!q || b.order === q.order) throw Error('Invalid paired order');
  return {id: b.id, repeat: b.repeat, baselineRecall: b.recall, qmdRecall: q.recall,
    completionDifferenceMs: q.ms - b.ms, completionSpeedup: b.ms / q.ms,
    baselineEvidenceMs: b.evidenceMs, qmdEvidenceMs: q.evidenceMs,
    evidenceDifferenceMs: (q.evidenceMs ?? 120000) - (b.evidenceMs ?? 120000),
    evidenceSpeedup: (b.evidenceMs ?? 120000) / (q.evidenceMs ?? 120000),
    auditedEvidenceDifferenceMs: (q.auditedEvidenceMs ?? 120000) - (b.auditedEvidenceMs ?? 120000),
    auditedEvidenceSpeedup: (b.auditedEvidenceMs ?? 120000) / (q.auditedEvidenceMs ?? 120000),
    substantialEvidenceWin: b.evidenceMs !== null && q.evidenceMs !== null && b.evidenceMs / q.evidenceMs >= 2 && b.evidenceMs - q.evidenceMs >= 5000};
});
for (const id of new Set(validation.map(r => r.id))) {
  const bs = validation.filter(r => r.id === id && r.arm === 'baseline');
  if (bs.length !== 2 || bs[0].order === bs[1].order) throw Error('Repeats must reverse arm order');
}
const engines = [];
const engineSources = [['development-results.json', 'sdk-shared-cache'], ['development-fresh-results.json', 'sdk-fresh-cache'], ['development-http-results.json', 'native-http']];
if (existsSync(join(root, 'development-cli-results.json'))) engineSources.push(['development-cli-results.json', 'native-cli']);
for (const [file, stage] of engineSources) {
  for (const r of read(join(root, file))) engines.push({stage,
    ...pick(r, ['id', 'mode', 'repeat', 'ms', 'recall3', 'recall5', 'recall10', 'recallAll', 'matches', 'outputChars']),
    failed: !!r.error});
}
const engineSummary = [...new Set(engines.map(r => `${r.stage}/${r.mode}`))].map(key => {
  const rs = engines.filter(r => `${r.stage}/${r.mode}` === key);
  return {key, n: rs.length, medianMs: median(rs.map(r => r.ms)), p95Ms: quantile(rs.map(r => r.ms), .95),
    recall3: mean(rs.map(r => r.recall3).filter(x => x !== undefined)),
    recall5: mean(rs.map(r => r.recall5).filter(x => x !== undefined)),
    recall10: mean(rs.map(r => r.recall10).filter(x => x !== undefined)), failures: rs.filter(r => r.failed).length};
});
mkdirSync(destination, {recursive: true});
writeFileSync(join(destination, 'measurements.json'), JSON.stringify({receipts, adjudications: publicAdjudications, agents: all, pairs, engines}, null, 2) + '\n');
writeFileSync(join(destination, 'summary.json'), JSON.stringify({summaries, engineSummary,
  paired: {n: pairs.length, medianCompletionDifferenceMs: median(pairs.map(r => r.completionDifferenceMs)),
    medianCompletionSpeedup: median(pairs.map(r => r.completionSpeedup)), medianEvidenceDifferenceMs: median(pairs.map(r => r.evidenceDifferenceMs)),
    medianEvidenceSpeedup: median(pairs.map(r => r.evidenceSpeedup)),
    medianAuditedEvidenceDifferenceMs: median(pairs.map(r => r.auditedEvidenceDifferenceMs)),
    medianAuditedEvidenceSpeedup: median(pairs.map(r => r.auditedEvidenceSpeedup)),
    substantialEvidenceWins: pairs.filter(r => r.substantialEvidenceWin).length}}, null, 2) + '\n');
console.log(JSON.stringify({agentRuns: all.length, engineQueries: engines.length}));
