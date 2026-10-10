import { createRequire } from "node:module";
import { dirname, join } from "node:path";

interface AxNode {
  AXUniqueId?: string | null;
  frame?: { x: number; y: number; width: number; height: number };
  children?: AxNode[];
}

/** Use the app's screen identifier when SwiftUI exposes it in the raw AX tree. */
export function screenIdFromAxTree(roots: AxNode[]): string | null {
  const screen = roots[0]?.frame;
  const named: string[] = [];
  const landmarks: string[] = [];
  const visit = (node: AxNode) => {
    const id = node.AXUniqueId;
    const frame = node.frame;
    const visible = !screen || !frame || (
      frame.x < screen.width && frame.y < screen.height &&
      frame.x + frame.width > 0 && frame.y + frame.height > 0
    );
    if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) && !id.startsWith("_Tt")) {
      if (visible && /Screen$/.test(id)) named.push(id);
      else if (!/^mainNavigation/.test(id)) landmarks.push(id);
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return named[0] ?? (landmarks[0] ? `ax:${landmarks[0]}` : null);
}

/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export async function currentScreenId(udid: string): Promise<string | null> {
  const require = createRequire(import.meta.url);
  const addonPath = join(dirname(require.resolve("serve-sim/middleware")), "native/serve-sim-native.node");
  const native = require(addonPath) as { axDescribe: (device: string) => Promise<string> };
  const roots = JSON.parse(await native.axDescribe(udid)) as AxNode[];
  return screenIdFromAxTree(roots);
}
