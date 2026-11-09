export const RESEARCH_LIBRARY_READER_FORMAT = "docling-html-embedded-v1";
export const RESEARCH_LIBRARY_BOOK_SCHEMA = "research-library-book-2";
export function parseResearchLibraryBook(value, contract) {
    if (!isRecord(value) || value.schemaVersion !== RESEARCH_LIBRARY_BOOK_SCHEMA)
        return null;
    const { slug, title, authors, sourceDirectory, bundle, reader } = value;
    const objectPrefix = normalizeObjectPrefix(contract.objectPrefix);
    if (!isSlug(slug) || typeof title !== "string" || !title.trim())
        return null;
    if (!isStringArray(authors) || authors.length === 0)
        return null;
    if (!validSourceDirectory(sourceDirectory))
        return null;
    if (!validBundle(bundle, contract.bucket, `${objectPrefix}/${slug}`))
        return null;
    if (!validReader(reader, contract.bucket, `${objectPrefix}/${slug}`, bundle.sha256))
        return null;
    return validOptionalFields(value) ? value : null;
}
function validSourceDirectory(sourceDirectory) {
    return typeof sourceDirectory === "string" && !!sourceDirectory && !sourceDirectory.includes("/") &&
        sourceDirectory !== "." && sourceDirectory !== "..";
}
/** The bundle object lives in the contract's bucket at <prefix>/<slug>/<sha256>.zip, with positive sizes. */
function validBundle(bundle, bucket, base) {
    if (!isRecord(bundle))
        return false;
    return bundle.bucket === bucket && typeof bundle.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(bundle.sha256) &&
        bundle.object === base + "/" + bundle.sha256 + ".zip" &&
        isPositiveInteger(bundle.bytes) && isPositiveInteger(bundle.files);
}
/** The reader is the HTML built from exactly this bundle, beside it in the same bucket. */
function validReader(reader, bucket, base, bundleSha256) {
    if (!isRecord(reader))
        return false;
    return reader.bucket === bucket && typeof reader.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(reader.sha256) &&
        reader.object === base + "/" + reader.sha256 + ".html" &&
        isPositiveInteger(reader.bytes) && reader.sourceBundleSha256 === bundleSha256 &&
        reader.format === RESEARCH_LIBRARY_READER_FORMAT;
}
function validOptionalFields(value) {
    const optionalStrings = [value.edition, value.publisher, value.language];
    if (optionalStrings.some((field) => field !== undefined &&
        (typeof field !== "string" || !field.trim())))
        return false;
    if (value.year !== undefined && !isPositiveInteger(value.year))
        return false;
    return value.isbn === undefined || isStringArray(value.isbn);
}
export function formatResearchLibraryBytes(bytes) {
    if (bytes < 1024 * 1024)
        return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function normalizeObjectPrefix(value) {
    return (value ?? "research-library/books").replace(/^\/+|\/+$/g, "");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSlug(value) {
    return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string" && Boolean(entry.trim()));
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
//# sourceMappingURL=index.js.map