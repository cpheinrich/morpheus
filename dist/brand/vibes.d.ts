/**
 * The deliberately unstructured design brief that starts a brand exploration.
 *
 * A finished identity needs more than a questionnaire can capture: visual
 * material, compositional instincts, half-formed references and the things a
 * founder notices before they have vocabulary for them. `brand-vibes.md` keeps
 * that input in one editable place without pretending it is already the final
 * strategy or visual system.
 */
export declare const VIBES_FILE = "brand-vibes.md";
export declare const LEGACY_VIBES_FILE = "vibes.txt";
export declare function renderVibes(name: string): string;
export interface VibesStatus {
    exists: boolean;
    ready: boolean;
    text: string;
}
export declare function vibesReady(text: string): boolean;
export declare function readVibes(brandDir: string): Promise<VibesStatus>;
export declare function writeVibes(brandDir: string, name: string): Promise<string>;
