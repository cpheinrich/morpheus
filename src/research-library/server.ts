import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import {
  parseResearchLibraryBook,
  type ResearchLibraryCatalog,
  type ResearchLibraryContract,
} from "./index.js";

export async function loadResearchLibraryCatalog(
  repoRoot: string,
  contract: ResearchLibraryContract,
): Promise<ResearchLibraryCatalog> {
  const books: ResearchLibraryCatalog["books"] = [];
  const issues: ResearchLibraryCatalog["issues"] = [];
  const repositoryRoot = await realpath(repoRoot);
  const catalogDir = contract.catalogDir ?? "hq/research/library/catalog";
  const requested = path.resolve(repositoryRoot, catalogDir);
  let catalogRoot: string;
  try {
    const stats = await lstat(requested);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return { books, issues: [{ path: catalogDir, message: "catalog is not a real directory" }] };
    }
    catalogRoot = await realpath(requested);
  } catch {
    return { books, issues: [{ path: catalogDir, message: "catalog is unavailable" }] };
  }
  if (catalogRoot !== requested || !catalogRoot.startsWith(repositoryRoot + path.sep)) {
    return { books, issues: [{ path: catalogDir, message: "catalog resolves outside the repository" }] };
  }
  const entries = await readdir(catalogRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const sourcePath = catalogDir + "/" + entry.name;
    try {
      const parsed = parseResearchLibraryBook(
        JSON.parse(await readFile(path.join(catalogRoot, entry.name), "utf8")), contract,
      );
      if (!parsed || entry.name !== parsed.slug + ".json") {
        issues.push({ path: sourcePath, message: "manifest does not match the library schema" });
        continue;
      }
      books.push(parsed);
    } catch {
      issues.push({ path: sourcePath, message: "manifest could not be read" });
    }
  }
  books.sort((left, right) => left.title.localeCompare(right.title));
  return { books, issues };
}
