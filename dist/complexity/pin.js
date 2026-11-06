import { createHash } from "node:crypto";
export const LIZARD_PIN = {
    repository: "https://github.com/terryyin/lizard.git",
    commit: "4f6979da10faabc72f1564f9341588afbb2924f0",
    reachableFrom: "terryyin/lizard master (merge of PR557, 2026-11-06)",
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
 * What the canary snippet in `lizard_runner.py` must measure as. A wrong
 * Lizard, a venv whose interpreter vanished after an upgrade, or a stamp
 * written by hand all fail this, which is why every check runs it rather than
 * trusting `ready.json`.
 */
export const CANARY_EXPECTED = { name: "canary", ccn: 6, cognitive: 8 };
//# sourceMappingURL=pin.js.map