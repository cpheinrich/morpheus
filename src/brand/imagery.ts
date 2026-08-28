import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * A visual asset belongs in the final package only when another surface knows
 * how to use it. `source` may be a small tracked asset or a CDN object key;
 * raw media stays outside Git when it is too large for a source repository.
 */
export const BrandImageAsset = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(2),
  kind: z.enum(["illustration", "photography", "diagram", "texture", "other"]),
  source: z.string().min(1),
  alt: z.string().min(8),
  placements: z.array(z.string().min(2)).min(1),
  provenance: z.string().min(8),
  editorialBoundary: z.string().trim().min(1).optional(),
});

export const BrandImagery = z.object({
  direction: z.string().min(2),
  moodboards: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        title: z.string().min(2),
        source: z.string().min(1),
        takeaway: z.string().min(8),
      }),
    )
    .min(1),
  assets: z.array(BrandImageAsset).min(1),
});

export type BrandImagery = z.infer<typeof BrandImagery>;
export const IMAGERY_FILE = "imagery.json";

export async function readImagery(dir: string): Promise<BrandImagery | null> {
  try {
    return BrandImagery.parse(JSON.parse(await readFile(join(dir, IMAGERY_FILE), "utf8")));
  } catch {
    return null;
  }
}

export async function checkImagery(dir: string): Promise<string | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, IMAGERY_FILE), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "unreadable or invalid JSON";
  }

  const parsed = BrandImagery.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `invalid manifest${issue ? ` — ${issue.path.join(".")}: ${issue.message}` : ""}`;
  }

  const hasLivePlacement = parsed.data.assets.some((asset) =>
    asset.placements.some((placement) => /home|marketing|app|product|hero/i.test(placement)),
  );
  return hasLivePlacement ? null : "no asset is assigned to a public or product surface";
}
