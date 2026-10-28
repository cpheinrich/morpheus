export function fragments(text: string): string[];
export function scorePassages(groups: {path: string; text?: string; quote?: string}[][], passages: {path: string; text: string}[]):
  {docRecall: number; windowRecall: number; chars: number; passages: number};
export function screen(root: string, fixtures: Record<string, any>[], arms: Record<string, {mode: string; options?: Record<string, unknown>}>):
  {rows: Record<string, any>[]; setup: Record<string, any>[]};
export function summarize(rows: Record<string, any>[]): Record<string, any>[];
