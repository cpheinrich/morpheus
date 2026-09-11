/** Cells are already formatted by each consumer; preserve their escaping policy. */
export function markdownTable(headers: string[], rows: string[][], empty?: string): string {
  if (rows.length === 0 && empty !== undefined) return empty;
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}
