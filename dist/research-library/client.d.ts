import type { ResearchLibraryBundle } from "./index.js";
export declare function verifiedResearchLibraryBlob(identity: Pick<ResearchLibraryBundle, "bytes" | "sha256">, load: () => Promise<Blob>): Promise<Blob>;
