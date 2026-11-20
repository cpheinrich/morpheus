import { createHash } from "node:crypto";

// Synthetic fixtures only: invented app, ids, bytes and terms.
export const FILES: Record<string, string> = {
  "screens/home.png": "synthetic-png-home",
  "screens/home.ax.json": '{"role":"window"}',
  "exports/flows.csv": "from,to\nhome,settings\n",
};
export const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const asset = (text: string, contentType: string) => ({ bytes: Buffer.byteLength(text), sha256: sha(text), contentType });

export function syntheticStudy() {
  return {
    schemaVersion: 1,
    studyId: "study-1",
    capturedAt: "2026-11-01T12:00:00Z",
    device: { model: "iPhone 16", osVersion: "18.1" },
    captureTool: { name: "synthetic", version: "0" },
    app: {
      slug: "example-app", name: "Example App", version: "1.2.3", status: "observed", summary: "A synthetic app.",
      entryScreenId: "home",
      screens: [
        {
          id: "home", title: "Home", state: "signed in", description: "Landing screen.",
          elements: [
            { id: "settings-button", label: "Settings", role: "button", behavior: "opens settings", status: "verified",
              bounds: { x: 300, y: 60, width: 80, height: 44 }, evidence: ["Tapped in replay 1"] },
            { id: "promo", label: "Promo", role: "image", behavior: "none", status: "observed", bounds: null },
          ],
          screenshots: [{
            path: "screens/home.png", accessibility: "screens/home.ax.json", capturedAt: "2026-11-01T12:00:00Z",
            sha256: sha(FILES["screens/home.png"]!), width: 1179, height: 2556, position: "top",
          }],
        },
        {
          id: "settings", title: "Settings", state: "protected", description: "Secure screen; capture blocked.",
          elements: [], screenshots: null,
        },
      ],
      transitions: [{
        id: "t1", actionId: "a1", from: "home", to: "settings", elementId: "settings-button",
        action: "Tap Settings", result: "Settings opens", status: "verified",
      }],
      gaps: ["Purchase flow not explored"],
      replayChecks: [],
      metrics: { screens: 2 },
    },
    assets: {
      "screens/home.png": asset(FILES["screens/home.png"]!, "image/png"),
      "screens/home.ax.json": asset(FILES["screens/home.ax.json"]!, "application/json"),
      "exports/flows.csv": asset(FILES["exports/flows.csv"]!, "text/csv"),
    },
    downloads: [{ label: "Flow table", path: "exports/flows.csv" }],
  };
}
