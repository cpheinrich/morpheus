import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
/** Use the app's screen identifier when SwiftUI exposes it in the raw AX tree. */
export function screenIdFromAxTree(roots) {
    const screen = roots[0]?.frame;
    const named = [];
    const landmarks = [];
    const visit = (node) => {
        const id = node.AXUniqueId;
        const frame = node.frame;
        const visible = !screen || !frame || (frame.x < screen.width && frame.y < screen.height &&
            frame.x + frame.width > 0 && frame.y + frame.height > 0);
        if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) && !id.startsWith("_Tt")) {
            if (visible && /Screen$/.test(id))
                named.push(id);
            else if (!/^mainNavigation/.test(id))
                landmarks.push(id);
        }
        for (const child of node.children ?? [])
            visit(child);
    };
    for (const root of roots)
        visit(root);
    if (named[0])
        return named[0];
    if (!landmarks[0])
        return null;
    const digest = createHash("sha256").update([...new Set(landmarks)].sort().join("\n")).digest("hex").slice(0, 12);
    return `ax:${landmarks[0]}:${digest}`;
}
/** Preserve serve-sim's element paths while retaining the screen ID from that same native tree. */
export function qaAxSnapshotFromTree(roots) {
    const screenFrame = roots[0]?.frame;
    const screen = { width: screenFrame?.width ?? 1, height: screenFrame?.height ?? 1 };
    const elements = [];
    const visit = (node, path) => {
        if (elements.length >= 500)
            return;
        const frame = node.frame;
        if (frame && screenFrame && (Math.abs(frame.x - screenFrame.x) >= 0.5 ||
            Math.abs(frame.y - screenFrame.y) >= 0.5 ||
            Math.abs(frame.width - screenFrame.width) >= 0.5 ||
            Math.abs(frame.height - screenFrame.height) >= 0.5)) {
            elements.push({
                id: node.AXUniqueId ?? path,
                path,
                frame,
                label: node.AXLabel ?? "",
                value: node.AXValue ?? "",
                role: node.role_description ?? "",
                type: node.type ?? "",
                enabled: node.enabled !== false,
            });
        }
        for (let i = 0; i < (node.children?.length ?? 0) && elements.length < 500; i++) {
            visit(node.children[i], `${path}.${i}`);
        }
    };
    for (let i = 0; i < roots.length && elements.length < 500; i++)
        visit(roots[i], String(i));
    return { screen, screenId: screenIdFromAxTree(roots), elements };
}
function nativeAxTree(udid) {
    const require = createRequire(import.meta.url);
    const addonPath = join(dirname(require.resolve("serve-sim/middleware")), "native/serve-sim-native.node");
    const native = require(addonPath);
    return native.axDescribe(udid).then((raw) => JSON.parse(raw));
}
export async function currentQaAxSnapshot(udid) {
    return qaAxSnapshotFromTree(await nativeAxTree(udid));
}
/** Capture the image between matching native screen identities, so the saved PNG and ID agree. */
export async function captureQaPlacement(udid) {
    const before = await currentQaAxSnapshot(udid);
    if (!before.screenId)
        throw new Error("Simulator screen ID unavailable");
    const dir = await mkdtemp(join(tmpdir(), "morpheus-qa-placement-"));
    const path = join(dir, "frame.png");
    try {
        await execFileAsync("xcrun", ["simctl", "io", udid, "screenshot", "--type=png", path], { timeout: 5000 });
        const capturedAt = new Date().toISOString();
        const [bytes, after] = await Promise.all([readFile(path), currentQaAxSnapshot(udid)]);
        if (after.screenId !== before.screenId)
            throw new Error("Screen changed during placement capture");
        if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
            throw new Error("Simulator placement screenshot is invalid");
        }
        return {
            screenId: before.screenId,
            snapshot: after,
            frame: {
                dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
                width: bytes.readUInt32BE(16),
                height: bytes.readUInt32BE(20),
                capturedAt,
            },
        };
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
}
/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export async function currentScreenId(udid) {
    return screenIdFromAxTree(await nativeAxTree(udid));
}
//# sourceMappingURL=screen-id.js.map