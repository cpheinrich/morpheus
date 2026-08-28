import { hqSearchAliases, plainText } from "./build.js";
/**
 * Extracts text when the PDF contains it. Scans and image-only PDFs remain
 * searchable by filename and path; OCR deliberately stays outside v1.
 */
export async function pdfSearchDocument(input) {
    let text = "";
    let parser;
    try {
        const { PDFParse } = await import("pdf-parse");
        parser = new PDFParse({ data: input.data });
        const result = await parser.getText();
        text = result.pages.map((page) => page.text.trim()).filter(Boolean).join("\n\n");
    }
    catch (error) {
        input.onExtractionError?.(error);
    }
    finally {
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
//# sourceMappingURL=pdf.js.map