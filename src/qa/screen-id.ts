import { createRequire } from "node:module";
import { dirname, join } from "node:path";

interface AxNode {
  AXUniqueId?: string | null;
  AXLabel?: string | null;
  AXValue?: string | null;
  enabled?: boolean;
  role_description?: string;
  type?: string;
  frame?: { x: number; y: number; width: number; height: number };
  children?: AxNode[];
}

export interface QaAxSnapshot {
  screen: { width: number; height: number };
  screenId: string | null;
  elements: Array<{
    id: string;
    path: string;
    frame: { x: number; y: number; width: number; height: number };
    label: string;
    value: string;
    role: string;
    type: string;
    enabled: boolean;
  }>;
  errors?: string[];
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

/** Preserve serve-sim's element paths while retaining the screen ID from that same native tree. */
export function qaAxSnapshotFromTree(roots: AxNode[]): QaAxSnapshot {
  const screenFrame = roots[0]?.frame;
  const screen = { width: screenFrame?.width ?? 1, height: screenFrame?.height ?? 1 };
  const elements: QaAxSnapshot["elements"] = [];
  const visit = (node: AxNode, path: string) => {
    if (elements.length >= 500) return;
    const frame = node.frame;
    if (frame && screenFrame && (
      Math.abs(frame.x - screenFrame.x) >= 0.5 ||
      Math.abs(frame.y - screenFrame.y) >= 0.5 ||
      Math.abs(frame.width - screenFrame.width) >= 0.5 ||
      Math.abs(frame.height - screenFrame.height) >= 0.5
    )) {
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
      visit(node.children![i]!, `${path}.${i}`);
    }
  };
  for (let i = 0; i < roots.length && elements.length < 500; i++) visit(roots[i]!, String(i));
  return { screen, screenId: screenIdFromAxTree(roots), elements };
}

function nativeAxTree(udid: string): Promise<AxNode[]> {
  const require = createRequire(import.meta.url);
  const addonPath = join(dirname(require.resolve("serve-sim/middleware")), "native/serve-sim-native.node");
  const native = require(addonPath) as { axDescribe: (device: string) => Promise<string> };
  return native.axDescribe(udid).then((raw) => JSON.parse(raw) as AxNode[]);
}

export async function currentQaAxSnapshot(udid: string): Promise<QaAxSnapshot> {
  return qaAxSnapshotFromTree(await nativeAxTree(udid));
}

/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export async function currentScreenId(udid: string): Promise<string | null> {
  return screenIdFromAxTree(await nativeAxTree(udid));
}
