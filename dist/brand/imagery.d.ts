import { z } from "zod";
/**
 * A visual asset belongs in the final package only when another surface knows
 * how to use it. `source` may be a small tracked asset or a CDN object key;
 * raw media stays outside Git when it is too large for a source repository.
 */
export declare const BrandImageAsset: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    kind: z.ZodEnum<{
        illustration: "illustration";
        photography: "photography";
        diagram: "diagram";
        texture: "texture";
        other: "other";
    }>;
    source: z.ZodString;
    alt: z.ZodString;
    placements: z.ZodArray<z.ZodString>;
    provenance: z.ZodString;
    editorialBoundary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const BrandImagery: z.ZodObject<{
    direction: z.ZodString;
    moodboards: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        source: z.ZodString;
        takeaway: z.ZodString;
    }, z.core.$strip>>;
    assets: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        kind: z.ZodEnum<{
            illustration: "illustration";
            photography: "photography";
            diagram: "diagram";
            texture: "texture";
            other: "other";
        }>;
        source: z.ZodString;
        alt: z.ZodString;
        placements: z.ZodArray<z.ZodString>;
        provenance: z.ZodString;
        editorialBoundary: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BrandImagery = z.infer<typeof BrandImagery>;
export declare const IMAGERY_FILE = "imagery.json";
export declare function readImagery(dir: string): Promise<BrandImagery | null>;
export declare function checkImagery(dir: string): Promise<string | null>;
