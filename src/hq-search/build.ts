import { createHqSearchIndex, type HqSearchDocument, type HqSearchPayload } from "./index.js";

export const HQ_SEARCH_PRIVATE_CACHE_CONTROL = "private, max-age=31536000, immutable";

export function hqSearchResponseHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": HQ_SEARCH_PRIVATE_CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
  };
}

export type MarkdownSearchDocumentInput = {
  id: string;
  title: string;
  href: string;
  path: string;
  source: string;
  metadata?: string | Record<string, unknown>;
  aliases?: string;
};

/** A deliberately small Markdown-to-search-text conversion, not a renderer. */
export function plainText(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, " $1 ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/gm, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function markdownHeadings(source: string) {
  return source
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      return match?.[1] ? [plainText(match[1])] : [];
    })
    .join(" ");
}

export function hqSearchAliases(source: string) {
  const aliases: string[] = [];
  if (/\bEIN\b|employer identification number/i.test(source)) {
    aliases.push("EIN employer identification number federal tax ID");
  }
  if (/\b(?:Q[1-4]|quarter)\b/i.test(source)) {
    aliases.push("Q1 Q2 Q3 Q4 first second third fourth quarter");
  }
  if (/reddit|username|handle/i.test(source)) {
    aliases.push("Reddit username handle user name");
  }
  return aliases.join(" ");
}

export function metadataText(metadata: string | Record<string, unknown> = "") {
  if (typeof metadata === "string") return metadata;
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" ");
}

export function markdownSearchDocument(input: MarkdownSearchDocumentInput): HqSearchDocument {
  const metadata = metadataText(input.metadata);
  const text = plainText(input.source);
  const source = `${input.title} ${input.path} ${metadata} ${text}`;
  const discoveredAliases = hqSearchAliases(source);

  return {
    id: input.id,
    title: input.title,
    href: input.href,
    path: input.path,
    kind: "markdown",
    headings: markdownHeadings(input.source),
    metadata,
    aliases: [input.aliases, discoveredAliases].filter(Boolean).join(" "),
    text,
  };
}

export function createHqSearchPayload(
  documents: HqSearchDocument[],
  options: { requireExtractedPdfText?: boolean } = {},
): HqSearchPayload {
  const pdfDocuments = documents.filter((document) => document.kind === "pdf");
  const pdfTextDocumentCount = pdfDocuments.filter((document) => document.text.length > 0).length;

  if (options.requireExtractedPdfText && pdfDocuments.length > 0 && pdfTextDocumentCount === 0) {
    throw new Error(
      "HQ search could not extract text from any PDF. Refusing to publish a filename-only index.",
    );
  }

  return {
    version: 1,
    documentCount: documents.length,
    pdfCount: pdfDocuments.length,
    pdfTextDocumentCount,
    index: createHqSearchIndex(documents).toJSON(),
  };
}
