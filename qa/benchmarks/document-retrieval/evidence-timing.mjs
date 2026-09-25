import {normalize, evidenceRecall} from './score.mjs';

export function outputText(item) {
  const strings = [];
  const visit = value => {
    if (typeof value === 'string') strings.push(cleanLines(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  if (item.type === 'command_execution') {
    const text = item.aggregated_output ?? '';
    // Native QMD CLI JSON escapes newlines inside full document bodies.
    try { visit(JSON.parse(text)); } catch { strings.push(cleanLines(text)); }
  } else visit(item.result);
  return strings.join('\n');
}

function cleanLines(text) {
  return text.split('\n').map(line => line
    .replace(/^.*?\.md[:-]\d+[:-]/, '')
    .replace(/^\s*\d+[:|-]\s?/, '')).join('\n');
}

export function scoreTimedEvidence(groups, citations, events, sourceText) {
  const valid = citations.filter(c => typeof c.path === 'string' && typeof c.quote === 'string' &&
    normalize(c.quote).length >= 30 && sourceText(c.path) !== null &&
    normalize(sourceText(c.path)).includes(normalize(c.quote)));
  const tools = events.filter(({event}) => event.type === 'item.completed' &&
    ['command_execution', 'mcp_tool_call'].includes(event.item?.type));
  const starts = events.filter(({event}) => event.type === 'item.started' &&
    ['command_execution', 'mcp_tool_call'].includes(event.item?.type));
  const groupTimes = groups.map(group => {
    const eligible = valid.filter(c => evidenceRecall([group], [c]) === 1);
    const hit = tools.find(({event}) => eligible.some(c => normalize(outputText(event.item)).includes(normalize(c.quote))));
    return hit?.atMs ?? null;
  });
  const evidenceMs = groupTimes.every(t => t !== null) ? Math.max(...groupTimes) : null;
  const firstToolMs = starts.length ? starts[0].atMs : null;
  return {recall: evidenceRecall(groups, valid), validCitations: valid.length,
    invalidCitations: citations.length - valid.length, groupTimes, evidenceMs, firstToolMs,
    retrievalMs: evidenceMs !== null && firstToolMs !== null ? evidenceMs - firstToolMs : null};
}
