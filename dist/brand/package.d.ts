/**
 * What a brand package must contain, and what it may grow.
 *
 * Declared once, in one place, because three consumers need the same list:
 * the design-session prompt tells an agent what to produce, `brand status`
 * reports what is missing, and the package README explains the contract to a
 * human. Written separately they would drift, and the drift would be silent —
 * a prompt asking for something nothing checks is indistinguishable from a
 * prompt asking for the right thing.
 *
 * **Required is deliberately small.** A required list long enough to be
 * thorough is a required list nobody completes, and a checklist that is never
 * green stops being read. Everything else is optional with a stated trigger,
 * so "not yet" is a legible state rather than an omission.
 */
/** Returns a reason the file is not yet finished, or null when it is. */
export type Check = (dir: string) => Promise<string | null>;
export interface PackageEntry {
    path: string;
    /** What it is for — rendered into the prompt and the README. */
    purpose: string;
    /**
     * Who is expected to produce it. The wizard's own outputs are required too,
     * but they are already satisfied by the time anyone reads this, so the
     * prompt only asks for the session's share.
     */
    source: "wizard" | "session";
    check?: Check;
}
export interface OptionalEntry {
    path: string;
    purpose: string;
    /** The circumstance that makes this worth adding. */
    when: string;
}
/** "a", "a and b", "a, b and c" — a bare join reads as "a and b and c". */
export declare function list(xs: string[]): string;
/**
 * The minimum for a package someone else can apply without having been in the
 * room. Anything here that is missing means a person has to ask a question
 * that the package was supposed to answer.
 */
export declare const REQUIRED: PackageEntry[];
/**
 * Added when the need arrives, not up front. Each carries the trigger, so the
 * list reads as a set of decisions deferred rather than work outstanding.
 */
export declare const OPTIONAL: OptionalEntry[];
/**
 * `delegated` — required, and satisfied somewhere else on purpose.
 *
 * A project with an existing visual system owns its tokens where they already
 * live (architecture §15.1a). Reporting `hq/brand/tokens.json` missing there
 * would be telling the owner to create the second canonical source that the
 * generator deliberately refuses to scaffold.
 */
export type EntryState = "ok" | "missing" | "incomplete" | "delegated";
export interface EntryStatus {
    path: string;
    purpose: string;
    source: PackageEntry["source"];
    state: EntryState;
    /** Why it is not ok — absent when it is. */
    detail?: string;
}
export interface PackageStatus {
    required: EntryStatus[];
    optional: Array<OptionalEntry & {
        present: boolean;
    }>;
    /** True when every required entry is satisfied. */
    complete: boolean;
}
export declare function packageStatus(brandDir: string): Promise<PackageStatus>;
export declare function formatStatus(s: PackageStatus, name: string): string;
