import { z } from "zod";
/**
 * `morpheus.json` → `complexity`. Absent means not enrolled: the local check
 * still runs as advisory, and CI skips. There is deliberately no switch for a
 * path or a threshold beyond `exclude` and `ccn`, both of which every report
 * prints, and no exception without a reason, a reference and the measured CCN
 * it covers — so an exception never silently covers growth.
 */
export declare const ExceptionSchema: z.ZodObject<{
    path: z.ZodString;
    longName: z.ZodString;
    ccn: z.ZodNumber;
    kind: z.ZodEnum<{
        "analyzer-false-positive": "analyzer-false-positive";
        semantic: "semantic";
    }>;
    reason: z.ZodString;
    ref: z.ZodString;
}, z.core.$strict>;
export declare const ComplexityConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        advisory: "advisory";
        enforce: "enforce";
    }>>;
    ccn: z.ZodDefault<z.ZodNumber>;
    cognitiveWarn: z.ZodDefault<z.ZodNumber>;
    include: z.ZodDefault<z.ZodArray<z.ZodString>>;
    exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
    exceptions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        longName: z.ZodString;
        ccn: z.ZodNumber;
        kind: z.ZodEnum<{
            "analyzer-false-positive": "analyzer-false-positive";
            semantic: "semantic";
        }>;
        reason: z.ZodString;
        ref: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type ComplexityConfig = z.infer<typeof ComplexityConfigSchema>;
export type ComplexityException = z.infer<typeof ExceptionSchema>;
export type ConfigRead = {
    ok: true;
    enrolled: boolean;
    config: ComplexityConfig;
    raw: unknown;
} | {
    ok: false;
    reason: string;
};
/** Parse the `complexity` block out of a manifest's text; `null` text means no manifest. */
export declare function readConfig(manifestText: string | null): ConfigRead;
export declare function inScope(config: ComplexityConfig, path: string): boolean;
/**
 * The block's change between the merge base and the tree under check, as
 * lines for a warning. CI reads the head's own policy, so a pull request can
 * loosen it for the very file it edits; this is how a reviewer sees that.
 */
export declare function policyDelta(before: unknown, after: unknown): string[];
