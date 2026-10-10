export function scoreHistoryEvidence(groups: unknown[], citations: unknown[], events: unknown[], sourceText: (path: string) => string | null): {recall: number; evidenceMs: number | null; invalidCitations: number; [key: string]: unknown};
export function summarizeHistory(rows: Record<string, any>[]): {summaries: Record<string, any>[]; pairs: Record<string, any>[]};
