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
 * What the canary snippet in `lizard_runner.py` must measure as. A wrong
 * Lizard, a venv whose interpreter vanished after an upgrade, or a stamp
 * written by hand all fail this, which is why every check runs it rather than
 * trusting `ready.json`.
 */
export declare const CANARY_EXPECTED: {
    readonly name: "canary";
    readonly ccn: 6;
    readonly cognitive: 8;
};
