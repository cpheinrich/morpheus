import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
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
    if (typeof sourceDirectory !== "string" || !sourceDirectory || sourceDirectory.includes("/") ||
        sourceDirectory === "." || sourceDirectory === "..")
        return null;
    if (!isRecord(bundle))
        return null;
    if (bundle.bucket !== contract.bucket || typeof bundle.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(bundle.sha256) ||
        bundle.object !== objectPrefix + "/" + slug + "/" + bundle.sha256 + ".zip" ||
        !isPositiveInteger(bundle.bytes) || !isPositiveInteger(bundle.files))
        return null;
    if (!isRecord(reader))
        return null;
    if (reader.bucket !== contract.bucket || typeof reader.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(reader.sha256) ||
        reader.object !== objectPrefix + "/" + slug + "/" + reader.sha256 + ".html" ||
        !isPositiveInteger(reader.bytes) || reader.sourceBundleSha256 !== bundle.sha256 ||
        reader.format !== RESEARCH_LIBRARY_READER_FORMAT)
        return null;
    const optionalStrings = [value.edition, value.publisher, value.language];
    if (optionalStrings.some((field) => field !== undefined &&
        (typeof field !== "string" || !field.trim())))
        return null;
    if (value.year !== undefined && !isPositiveInteger(value.year))
        return null;
    if (value.isbn !== undefined && !isStringArray(value.isbn))
        return null;
    return value;
}
export async function loadResearchLibraryCatalog(repoRoot, contract) {
    const books = [];
    const issues = [];
    const repositoryRoot = await realpath(repoRoot);
    const catalogDir = contract.catalogDir ?? "hq/research/library/catalog";
    const requested = path.resolve(repositoryRoot, catalogDir);
    let catalogRoot;
    try {
        const stats = await lstat(requested);
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
            return { books, issues: [{ path: catalogDir, message: "catalog is not a real directory" }] };
        }
        catalogRoot = await realpath(requested);
    }
    catch {
        return { books, issues: [{ path: catalogDir, message: "catalog is unavailable" }] };
    }
    if (catalogRoot !== requested || !catalogRoot.startsWith(repositoryRoot + path.sep)) {
        return { books, issues: [{ path: catalogDir, message: "catalog resolves outside the repository" }] };
    }
    const entries = await readdir(catalogRoot, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() || !entry.name.endsWith(".json"))
            continue;
        const sourcePath = catalogDir + "/" + entry.name;
        try {
            const parsed = parseResearchLibraryBook(JSON.parse(await readFile(path.join(catalogRoot, entry.name), "utf8")), contract);
            if (!parsed || entry.name !== parsed.slug + ".json") {
                issues.push({ path: sourcePath, message: "manifest does not match the library schema" });
                continue;
            }
            books.push(parsed);
        }
        catch {
            issues.push({ path: sourcePath, message: "manifest could not be read" });
        }
    }
    books.sort((left, right) => left.title.localeCompare(right.title));
    return { books, issues };
}
export async function verifiedResearchLibraryBlob(identity, load) {
    const blob = await load();
    if (blob.size !== identity.bytes)
        throw new Error("The downloaded byte count did not match the catalog.");
    if (await sha256(blob) !== identity.sha256) {
        throw new Error("The downloaded SHA-256 did not match the catalog.");
    }
    return blob;
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
async function sha256(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=index.js.map