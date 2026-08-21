import type { Item } from "./parse.js";
import type { Goal, Request } from "./schema.js";
export declare const BEGIN = "<!-- morpheus:begin -->";
export declare const END = "<!-- morpheus:end -->";
export declare const STATIC_ROADMAP_README = "# Roadmap\n\nOne Markdown file per item. Item frontmatter is canonical: agents, Morpheus\ncommands, and the `/hq` roadmap view parse those files directly.\n\nThis README is deliberately static. Do not add a generated task table here:\nconcurrent status changes would all rewrite this one file and create avoidable\nmerge conflicts.\n";
export declare function renderGoals(items: Item<Goal>[]): string;
export declare function renderRequests(items: Item<Request>[]): string;
/**
 * Splice a generated table into a README, preserving anything outside the
 * markers. A README with no markers is created fresh; hand-written prose
 * above or below the block survives regeneration.
 */
export declare function spliceIndex(existing: string | null, generated: string): string;
/**
 * Retire the old generated roadmap table once, without overwriting a README
 * that is already hand-maintained. Future calls are no-ops.
 */
export declare function writeStaticRoadmapReadme(dir: string, checkOnly?: boolean): Promise<boolean>;
/** Write the generated table into `<dir>/README.md`. Returns true if changed. */
export declare function writeIndex(dir: string, generated: string, checkOnly?: boolean): Promise<boolean>;
