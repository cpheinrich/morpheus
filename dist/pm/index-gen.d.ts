import type { Item } from "./parse.js";
import type { Goal, Request, RoadmapItem } from "./schema.js";
export declare const BEGIN = "<!-- morpheus:begin -->";
export declare const END = "<!-- morpheus:end -->";
export declare function renderRoadmap(items: Item<RoadmapItem>[]): string;
export declare function renderGoals(items: Item<Goal>[]): string;
export declare function renderRequests(items: Item<Request>[]): string;
/**
 * Splice a generated table into a README, preserving anything outside the
 * markers. A README with no markers is created fresh; hand-written prose
 * above or below the block survives regeneration.
 */
export declare function spliceIndex(existing: string | null, generated: string): string;
/** Write the generated table into `<dir>/README.md`. Returns true if changed. */
export declare function writeIndex(dir: string, generated: string): Promise<boolean>;
