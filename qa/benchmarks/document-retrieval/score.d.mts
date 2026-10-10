export type EvidenceSource = {path: string; text: string};
export type Citation = {path: string; quote: string};
export function digest(value: string | Uint8Array): string;
export function normalize(value: string): string;
export function recallAt(groups: EvidenceSource[][], paths: string[], k: number): number;
export function reciprocalRank(groups: EvidenceSource[][], paths: string[]): number;
export function evidenceRecall(groups: EvidenceSource[][], citations: Citation[]): number;
export function quantile(values: number[], p: number): number | null;
export function mean(values: number[]): number | null;
