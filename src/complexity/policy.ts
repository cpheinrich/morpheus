import { minimatch } from "minimatch";
import { z } from "zod";

/**
 * `morpheus.json` → `complexity`. Absent means not enrolled: the local check
 * still runs as advisory, and CI skips. There is deliberately no switch for a
 * path or a threshold beyond `exclude` and `ccn`, both of which every report
 * prints, and no exception without a reason, a reference and the measured CCN
 * it covers — so an exception never silently covers growth.
 */
export const ExceptionSchema = z.strictObject({
  path: z.string().min(1),
  /** Lizard's long name, e.g. `init ( coder : NSCoder )`; a Swift file has several `init`s. */
  longName: z.string().min(1),
  ccn: z.number().int().positive(),
  kind: z.enum(["analyzer-false-positive", "semantic"]),
  reason: z.string().min(10),
  /** An upstream issue or PR for a false positive; the review or decision for a semantic one. */
  ref: z.string().min(3),
});

/**
 * minimatch reads a leading `!` as negating the whole pattern, so `!(ops)/**` in `exclude` would
 * exclude everything outside `ops/`. Refused rather than reinterpreted.
 */
const Glob = z.string().min(1).refine((g) => !g.startsWith("!"), "a leading ! negates the whole pattern; name the directories instead");

export const ComplexityConfigSchema = z.strictObject({
  mode: z.enum(["advisory", "enforce"]).default("advisory"),
  ccn: z.number().int().positive().default(15),
  cognitiveWarn: z.number().int().positive().default(15),
  include: z.array(Glob).default(["**"]),
  exclude: z.array(Glob).default([]),
  exceptions: z.array(ExceptionSchema).default([]),
});

export type ComplexityConfig = z.infer<typeof ComplexityConfigSchema>;
export type ComplexityException = z.infer<typeof ExceptionSchema>;

export type ConfigRead = { ok: true; enrolled: boolean; config: ComplexityConfig; raw: unknown } | { ok: false; reason: string };

/** Parse the `complexity` block out of a manifest's text; `null` text means no manifest. */
export function readConfig(manifestText: string | null): ConfigRead {
  if (manifestText === null) return { ok: true, enrolled: false, config: ComplexityConfigSchema.parse({}), raw: undefined };
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    return { ok: false, reason: `morpheus.json is not JSON: ${(error as Error).message}` };
  }
  const raw = (manifest as Record<string, unknown> | null)?.["complexity"];
  if (raw === undefined) return { ok: true, enrolled: false, config: ComplexityConfigSchema.parse({}), raw };
  const parsed = ComplexityConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "complexity"}: ${i.message}`).join("; ");
    return { ok: false, reason: `morpheus.json complexity is invalid — ${issues}` };
  }
  return { ok: true, enrolled: true, config: parsed.data, raw };
}

export function inScope(config: ComplexityConfig, path: string): boolean {
  const match = (pattern: string) => minimatch(path, pattern, { dot: true });
  return config.include.some(match) && !config.exclude.some(match);
}

/**
 * The block's change between the merge base and the tree under check, as
 * lines for a warning. CI reads the head's own policy, so a pull request can
 * loosen it for the very file it edits; this is how a reviewer sees that.
 */
export function policyDelta(before: unknown, after: unknown): string[] {
  const show = (value: unknown) => (value === undefined ? "(absent)" : JSON.stringify(value));
  if (show(before) === show(after)) return [];
  return [`complexity policy changed in this range`, `  before: ${show(before)}`, `  after:  ${show(after)}`];
}
