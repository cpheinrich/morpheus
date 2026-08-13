/** Returns a reason the file is not ready, or null when it is. */
export type Check = (dir: string) => Promise<string | null>;
export type PackageSource = "scaffold" | "input" | "exploration" | "final";
export interface PackageEntry {
    path: string;
    purpose: string;
    source: PackageSource;
    check?: Check;
}
export interface OptionalEntry {
    path: string;
    purpose: string;
    when: string;
}
/** "a", "a and b", "a, b and c" — a bare join reads poorly. */
export declare function list(xs: string[]): string;
/**
 * The final package deliberately includes visual provenance and application,
 * because a selected direction loses meaning when a site consumes only its
 * tokens and copy. These entries are the enforceable handoff from concept
 * review to a real home page or app surface.
 */
export declare const REQUIRED: PackageEntry[];
export declare const OPTIONAL: OptionalEntry[];
export type EntryState = "ok" | "missing" | "incomplete";
export interface EntryStatus {
    path: string;
    purpose: string;
    source: PackageSource;
    state: EntryState;
    detail?: string;
}
export interface PackageStatus {
    required: EntryStatus[];
    optional: Array<OptionalEntry & {
        present: boolean;
    }>;
    complete: boolean;
}
export declare function packageStatus(brandDir: string): Promise<PackageStatus>;
export declare function formatStatus(status: PackageStatus, name: string): string;
