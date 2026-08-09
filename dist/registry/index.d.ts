import { z } from "zod";
/**
 * A local index of Morpheus projects on this machine.
 *
 * **Derived, never authoritative.** `morpheus.json` in each repo holds the
 * prefix and identity; this file only records where those repos are. A fresh
 * clone has no registry entry and must still work, so nothing may depend on it
 * for correctness — it exists to enable cross-project commands and to catch a
 * prefix collision at allocation time.
 */
export declare const PREFIX: RegExp;
export declare const RegisteredProject: z.ZodObject<{
    name: z.ZodString;
    prefix: z.ZodString;
    path: z.ZodString;
    kind: z.ZodEnum<{
        company: "company";
        personal: "personal";
        internal: "internal";
    }>;
    org: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RegisteredProject = z.infer<typeof RegisteredProject>;
export declare const Registry: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        prefix: z.ZodString;
        path: z.ZodString;
        kind: z.ZodEnum<{
            company: "company";
            personal: "personal";
            internal: "internal";
        }>;
        org: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type Registry = z.infer<typeof Registry>;
export declare function registryPath(): string;
export declare function readRegistry(path?: string): Promise<Registry>;
export declare function writeRegistry(reg: Registry, path?: string): Promise<void>;
export declare class RegistryError extends Error {
}
/** Suggest a prefix from a project name, avoiding what is already taken. */
export declare function suggestPrefix(name: string, taken: Set<string>): string;
export interface AddOptions {
    name: string;
    prefix: string;
    path: string;
    kind: RegisteredProject["kind"];
    org?: string;
}
/** Register a project. Rejects a duplicate name, path, or prefix. */
export declare function addProject(opts: AddOptions, path?: string): Promise<Registry>;
export declare function removeProject(name: string, path?: string): Promise<Registry>;
export declare function takenPrefixes(reg: Registry): Set<string>;
