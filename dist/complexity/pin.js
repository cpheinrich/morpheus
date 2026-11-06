import { createHash } from "node:crypto";
export const LIZARD_PIN = {
    // Upstream master 4f6979da (PR552, PR557) plus open PRs 556, 558, 559 and 560. Adopt plain
    // upstream once all four merge; until then a new integration gets a new tag, never a moved one.
    repository: "https://github.com/cpheinrich/lizard.git",
    commit: "7f14ea5c31ea3201c8c83eb2e0a89d1740e79edd",
    reachableFrom: "annotated tag morpheus-analyzer-2026-11-06 (object 725c706659709ad491fe8081e070d03eab513ef4)",
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
export function pinKey(pin) {
    const material = JSON.stringify({ repository: pin.repository, commit: pin.commit, requirements: pin.requirements });
    return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
/**
 * What the canary files in `lizard_runner.py` must measure as. The Swift and
 * TSX rows exercise the pinned fixes (computed properties, enum cases,
 * condition-list commas, string interpolation, JSX text, generic functions);
 * upstream `4f6979da` measures `label` not at all, the Swift top level at CCN
 * 4 and `Notice` at 4. A wrong Lizard, a venv whose interpreter vanished after
 * an upgrade, or a stamp written by hand all fail this, which is why every
 * check runs it rather than trusting `ready.json`.
 */
export const CANARY_EXPECTED = [
    { path: "canary.js", name: "canary", ccn: 6, cognitive: 8 },
    { path: "canary.swift", name: "label", ccn: 3, cognitive: 2 },
    { path: "canary.swift", name: "check", ccn: 4, cognitive: 1 },
    { path: "canary.swift", name: "*global*", ccn: 1, cognitive: 0 },
    { path: "canary.tsx", name: "pick", ccn: 2, cognitive: 0 },
    { path: "canary.tsx", name: "Notice", ccn: 2, cognitive: 1 },
];
//# sourceMappingURL=pin.js.map