import { z } from "zod";
/**
 * Report drift without fixing it.
 *
 * Deliberately the cheap half of `upgrade`: saying what is missing needs no
 * templating, no merge strategy, and no knowledge of how to fix anything — so
 * it stays useful while conventions are still moving, which is exactly when an
 * `upgrade` command would be a liability.
 *
 * **Never writes.** Anything it cannot fix, it names.
 */
export declare const Kind: z.ZodEnum<{
    company: "company";
    personal: "personal";
    internal: "internal";
}>;
export type Kind = z.infer<typeof Kind>;
export declare const Manifest: z.ZodObject<{
    name: z.ZodOptional<z.ZodUnknown>;
    prefix: z.ZodOptional<z.ZodUnknown>;
    kind: z.ZodOptional<z.ZodUnknown>;
    context: z.ZodOptional<z.ZodUnknown>;
    inherits: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type Severity = "error" | "warning";
export interface Finding {
    severity: Severity;
    check: string;
    message: string;
}
/** Directories each kind is expected to have. */
export declare const EXPECTED: Record<Kind, string[]>;
export interface DoctorOptions {
    root: string;
    /** Skip checks that need the network. */
    offline?: boolean;
}
export declare function doctor(opts: DoctorOptions): Promise<Finding[]>;
export declare function formatFindings(findings: Finding[], label?: string): string;
