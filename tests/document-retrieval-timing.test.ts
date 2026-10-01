import {describe, expect, it} from 'vitest';
import {outputText, scoreTimedEvidence, type TimedEvent} from '../qa/benchmarks/document-retrieval/evidence-timing.mjs';

const a = {path: 'a.md', quote: 'The first required evidence passage is a sufficiently long literal quote.'};
const b = {path: 'b.md', quote: 'The second required evidence passage supports a different essential fact.'};
const ga = {path: a.path, text: a.quote};
const gb = {path: b.path, text: b.quote};
const source = (path: string) => path === a.path ? a.quote : path === b.path ? b.quote : null;
const started: TimedEvent = {atMs: 50, event: {type: 'item.started', item: {type: 'command_execution'}}};
const done = (atMs: number, text: string): TimedEvent => ({atMs, event: {
  type: 'item.completed', item: {type: 'command_execution', aggregated_output: text},
}});

describe('retrospective evidence delivery timing', () => {
  it('decodes full source bodies in native CLI JSON output', () => {
    const quote = a.quote + '\n' + b.quote;
    expect(outputText({type: 'command_execution', aggregated_output: JSON.stringify([{body: quote}])}))
      .toBe(quote);
  });
  it('waits for every required group rather than the first matching passage', () => {
    expect(scoreTimedEvidence([[ga], [gb]], [a, b], [started, done(100, a.quote), done(220, b.quote)], source))
      .toEqual({recall: 1, validCitations: 2, invalidCitations: 0, groupTimes: [100, 220],
        firstToolMs: 50, evidenceMs: 220, retrievalMs: 170});
  });
  it('does not give a fast evidence time to partial recall', () => {
    const result = scoreTimedEvidence([[ga], [gb]], [a], [started, done(100, a.quote)], source);
    expect(result.recall).toBe(.5);
    expect(result.evidenceMs).toBeNull();
    expect(result.retrievalMs).toBeNull();
  });
  it('rejects a fabricated source path even if the output contains the quote', () => {
    const result = scoreTimedEvidence([[ga]], [{...a, path: '../a.md'}], [done(100, a.quote)], source);
    expect(result).toMatchObject({recall: 0, invalidCitations: 1, evidenceMs: null});
  });
  it('requires the final quoted evidence to have actually appeared in tool output', () => {
    const result = scoreTimedEvidence([[ga]], [a], [started, done(100, 'unrelated search result')], source);
    expect(result.recall).toBe(1);
    expect(result.evidenceMs).toBeNull();
  });
  it('does not count a final answer or an unfinished tool as delivered source evidence', () => {
    const result = scoreTimedEvidence([[ga]], [a], [{atMs: 100, event: {
      type: 'item.started', item: {type: 'command_execution', aggregated_output: a.quote},
    }}, {atMs: 200, event: {type: 'item.completed', item: {type: 'agent_message', result: a.quote}}}], source);
    expect(result.evidenceMs).toBeNull();
  });
  it('normalizes numbered MCP source output and ripgrep context lines', () => {
    expect(outputText({type: 'mcp_tool_call', result: {content: [{type: 'text', text: `12: ${a.quote}`} ]}})).toContain(a.quote);
    const result = scoreTimedEvidence([[ga]], [a], [started, done(75, `a.md:12:${a.quote}`)], source);
    expect(result.evidenceMs).toBe(75);
    expect(result.retrievalMs).toBe(25);
  });
  it('reports unavailable start timing instead of inventing an interval', () => {
    const result = scoreTimedEvidence([[ga]], [a], [done(80, a.quote)], source);
    expect(result.evidenceMs).toBe(80);
    expect(result.firstToolMs).toBeNull();
    expect(result.retrievalMs).toBeNull();
  });
});
