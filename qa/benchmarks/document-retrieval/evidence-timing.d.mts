export interface Citation {path: string; quote: string}
export interface ToolItem {type: string; aggregated_output?: string; result?: unknown}
export interface TimedEvent {atMs: number; event: {type: string; item?: ToolItem}}
export function outputText(item: ToolItem): string;
export function scoreTimedEvidence(groups: {path: string; text: string}[][], citations: Citation[], events: TimedEvent[], sourceText: (path: string) => string | null): {
  recall: number; validCitations: number; invalidCitations: number;
  groupTimes: (number | null)[]; evidenceMs: number | null; firstToolMs: number | null;
  retrievalMs: number | null;
};
