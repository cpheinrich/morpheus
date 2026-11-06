import { createHash } from "node:crypto";

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

export const LIZARD_PIN: LizardPin = {
  // Upstream master 4f6979da (PR552, PR557) plus open PRs 556, 558, 559, 560 (at 24c6ff3, which
  // reads JSX spread, hyphenated and valueless attributes) and 562. Adopt plain upstream once all
  // five merge; until then a new integration gets a new tag, never a moved one. The previous pin,
  // 3b53c11 (tag morpheus-analyzer-2026-11-06-tsx), is this commit's first parent.
  repository: "https://github.com/cpheinrich/lizard.git",
  commit: "541623c0b98e8b5687ef5713d2ffbfb76ec17de0",
  reachableFrom: "annotated tag morpheus-analyzer-2026-11-06-jsx-boolean (object 39bc37751b3c58522ba540339f63406df3aa673a)",
  requirements: [
    "pygments==2.21.0 --hash=sha256:2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
    "pathspec==1.1.1 --hash=sha256:a00ce642f577bf7f473932318056212bc4f8bfdf53128c78bbd5af0b9b20b189",
  ],
  pythonFloor: [3, 9],
};

/**
 * The install directory's name: the whole pin, so a dependency bump never
 * reuses a venv built for different wheels.
 */
export function pinKey(pin: LizardPin): string {
  const material = JSON.stringify({ repository: pin.repository, commit: pin.commit, requirements: pin.requirements });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

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
export const CANARY_EXPECTED: readonly { path: string; name: string; ccn: number; cognitive: number; lines?: [number, number] }[] = [
  { path: "canary.js", name: "canary", ccn: 6, cognitive: 8 },
  { path: "canary.swift", name: "label", ccn: 3, cognitive: 2 },
  { path: "canary.swift", name: "check", ccn: 4, cognitive: 1 },
  { path: "canary.swift", name: "*global*", ccn: 1, cognitive: 0 },
  { path: "canary.tsx", name: "pick", ccn: 2, cognitive: 0 },
  { path: "canary.tsx", name: "Notice", ccn: 2, cognitive: 1 },
  { path: "canary.ts", name: "choose", ccn: 4, cognitive: 1 },
  { path: "canary.ts", name: "run", ccn: 3, cognitive: 2 },
  { path: "canary.ts", name: "*global*", ccn: 1, cognitive: 0 },
  { path: "attributes.tsx", name: "Row", ccn: 1, cognitive: 0, lines: [1, 3] },
  { path: "attributes.tsx", name: "Grid", ccn: 3, cognitive: 2, lines: [4, 11] },
  { path: "attributes.tsx", name: "Card", ccn: 2, cognitive: 1, lines: [12, 14] },
  { path: "attributes.tsx", name: "after", ccn: 2, cognitive: 1, lines: [15, 15] },
  { path: "attributes.jsx", name: "Row", ccn: 1, cognitive: 0, lines: [1, 3] },
  { path: "attributes.jsx", name: "Grid", ccn: 3, cognitive: 2, lines: [4, 11] },
  { path: "attributes.jsx", name: "Card", ccn: 2, cognitive: 1, lines: [12, 14] },
  { path: "attributes.jsx", name: "after", ccn: 2, cognitive: 1, lines: [15, 15] },
  { path: "valueless.tsx", name: "Chart", ccn: 2, cognitive: 1, lines: [1, 9] },
  { path: "valueless.tsx", name: "after", ccn: 2, cognitive: 1, lines: [10, 10] },
  { path: "valueless.jsx", name: "Chart", ccn: 2, cognitive: 1, lines: [1, 9] },
  { path: "valueless.jsx", name: "after", ccn: 2, cognitive: 1, lines: [10, 10] },
];
