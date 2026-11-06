export function stripLineNumbers(text: string): string;
export function claudeEvents(lines: {atMs: number; event: Record<string, any>}[]): {
  events: {atMs: number; event: Record<string, any>}[]; result: Record<string, any> | null;
  init: {model: string; tools: string[]} | null; rateLimits: Record<string, any>[]; answerAtMs: number | null};
export function usageStop(info: Record<string, any> | null | undefined, ceiling: number): string | null;
export function promptFor(arm: string, question: string, passages?: unknown[]): string;
export function childEnv(env: Record<string, string | undefined>): Record<string, string | undefined>;
export const common: string;
