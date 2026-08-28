import type { HqSearchDocument } from "./index.js";
import { hqSearchAliases, plainText } from "./build.js";

export type PdfSearchDocumentInput = {
  id: string;
  title: string;
  href: string;
  path: string;
  data: Uint8Array;
  metadata?: string;
  aliases?: string;
  onExtractionError?: (error: unknown) => void;
};

/**
 * Extracts text when the PDF contains it. Scans and image-only PDFs remain
 * searchable by filename and path; OCR deliberately stays outside v1.
 */
export async function pdfSearchDocument(input: PdfSearchDocumentInput): Promise<HqSearchDocument> {
  let text = "";
  let parser: import("pdf-parse").PDFParse | undefined;

  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: input.data });
    const result = await parser.getText();
    text = result.pages.map((page) => page.text.trim()).filter(Boolean).join("\n\n");
  } catch (error) {
    input.onExtractionError?.(error);
  } finally {
    await parser?.destroy();
  }

  const cleanText = plainText(text);
  const discoveredAliases = hqSearchAliases(`${input.title} ${input.path} ${cleanText}`);
  return {
    id: input.id,
    title: input.title,
    href: input.href,
    path: input.path,
    kind: "pdf",
    headings: "",
    metadata: input.metadata ?? "PDF",
    aliases: [input.aliases, discoveredAliases].filter(Boolean).join(" "),
    text: cleanText,
  };
}
