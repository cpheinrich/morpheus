import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
    return named[0] ?? (landmarks[0] ? `ax:${landmarks[0]}` : null);
}
/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export async function currentScreenId(udid) {
    const require = createRequire(import.meta.url);
    const addonPath = join(dirname(require.resolve("serve-sim/middleware")), "native/serve-sim-native.node");
    const native = require(addonPath);
    const roots = JSON.parse(await native.axDescribe(udid));
    return screenIdFromAxTree(roots);
}
//# sourceMappingURL=screen-id.js.map