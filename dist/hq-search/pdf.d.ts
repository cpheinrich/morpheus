import type { HqSearchDocument } from "./index.js";
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
export declare function pdfSearchDocument(input: PdfSearchDocumentInput): Promise<HqSearchDocument>;
