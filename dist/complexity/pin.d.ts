/**
 * The one analyzer every Morpheus project measures with. Moving any value here
 * is an ordinary reviewed change, and it reaches every consumer's CI at once
 * (they call `pr-check.yml@main`): before merging a move, run
 * `morpheus complexity check --all` on each enforcing consumer.
 *
 * `commit` is fetched by id, so the fetch itself is content-addressed; it must
 * stay reachable from a tag or branch that is never rewritten, or every
 * install fails once the commit is collected. Dependencies are exact binary
 * wheels with their PyPI SHA-256: Lizard imports both at load, and with
 * `--require-hashes` pip refuses anything else.
 */
export interface LizardPin {
    repository: string;
    commit: string;
    /** What keeps `commit` reachable, for the reader moving the pin. */
    reachableFrom: string;
    requirements: string[];
    /** Lowest Python both wheels declare in `Requires-Python`. */
    pythonFloor: [number, number];
}
export declare const LIZARD_PIN: LizardPin;
/**
 * The install directory's name: the whole pin, so a dependency bump never
 * reuses a venv built for different wheels.
 */
export declare function pinKey(pin: LizardPin): string;
/**
 * What the canary files in `lizard_runner.py` must measure as. The Swift and
 * TSX rows exercise the pinned fixes (computed properties, enum cases,
 * condition-list commas, string interpolation, JSX text, generic functions);
 * upstream `4f6979da` measures `label` not at all, the Swift top level at CCN
 * 4 and `Notice` at 4. The TypeScript rows exercise template literal types
 * inside interface and object-type bodies (PR562): `7f14ea5` and upstream
 * fold every later function into `*global*` (CCN 6, cognitive 3) and measure
 * neither `choose` nor `run`. The attribute rows exercise JSX spread attributes and hyphenated
 * attribute names inside children (PR560 at bb9efad), as `.tsx` and as `.jsx`; their line bounds
 * are part of the expectation because `484bbd0` runs `Grid` on to line 15 (CCN 4) and measures
 * neither `Card` nor `after`. The valueless rows exercise a valueless attribute after a braced one
 * (`margin={{ top: 6 }} accessibilityLayer`, `x={1} flag`; PR560 at 24c6ff3): `3b53c11` runs
 * `Chart` on to line 10 (CCN 3) and measures no `after`. A wrong Lizard, a venv whose interpreter vanished after
 * an upgrade, or a stamp written by hand all fail this, which is why every
 * check runs it rather than trusting `ready.json`.
 */
export declare const CANARY_EXPECTED: readonly {
    path: string;
    name: string;
    ccn: number;
    cognitive: number;
    lines?: [number, number];
}[];
