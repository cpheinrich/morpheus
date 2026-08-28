import { createHqSearchIndex } from "./index.js";
export const HQ_SEARCH_PRIVATE_CACHE_CONTROL = "private, max-age=31536000, immutable";
export function hqSearchResponseHeaders() {
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": HQ_SEARCH_PRIVATE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
    };
}
/** A deliberately small Markdown-to-search-text conversion, not a renderer. */
export function plainText(source) {
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
export function markdownHeadings(source) {
    return source
        .split(/\r?\n/)
        .flatMap((line) => {
        const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        return match?.[1] ? [plainText(match[1])] : [];
    })
        .join(" ");
}
export function hqSearchAliases(source) {
    const aliases = [];
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
export function metadataText(metadata = "") {
    if (typeof metadata === "string")
        return metadata;
    return Object.entries(metadata)
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(" ");
}
export function markdownSearchDocument(input) {
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
export function createHqSearchPayload(documents, options = {}) {
    const pdfDocuments = documents.filter((document) => document.kind === "pdf");
    const pdfTextDocumentCount = pdfDocuments.filter((document) => document.text.length > 0).length;
    if (options.requireExtractedPdfText && pdfDocuments.length > 0 && pdfTextDocumentCount === 0) {
        throw new Error("HQ search could not extract text from any PDF. Refusing to publish a filename-only index.");
    }
    return {
        version: 1,
        documentCount: documents.length,
        pdfCount: pdfDocuments.length,
        pdfTextDocumentCount,
        index: createHqSearchIndex(documents).toJSON(),
    };
}
//# sourceMappingURL=build.js.map