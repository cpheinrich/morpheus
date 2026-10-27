import { z } from "zod";
/**
 * A visual asset belongs in the final package only when another surface knows
 * how to use it. `source` may be a small tracked asset or a CDN object key;
 * raw media stays outside Git when it is too large for a source repository.
 */
export declare const BrandImageAsset: any;
export declare const BrandImagery: any;
export type BrandImagery = z.infer<typeof BrandImagery>;
export declare const IMAGERY_FILE = "imagery.json";
export declare function readImagery(dir: string): Promise<BrandImagery | null>;
export declare function checkImagery(dir: string): Promise<string | null>;
