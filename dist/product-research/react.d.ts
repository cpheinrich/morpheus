import { type AppeekySnapshot, type AppResearchStudy } from "./index.js";
/**
 * Browser views for a parsed study and App Store snapshot. Every asset is fetched through the
 * project's authenticated `readAsset`, only for the selected screen or an explicit download, and
 * rendered only after its byte count and SHA-256 match the study inventory. Nothing here renders
 * supplied HTML. Styling: import `morpheus-kit/product-research/styles.css` and override the
 * `--app-research-*` custom properties, or target the documented `app-research-*` classes.
 */
export type ReadAsset = (path: string) => Promise<Blob>;
export declare function ProductResearchViewer({ study, readAsset }: {
    study: AppResearchStudy;
    readAsset: ReadAsset;
}): import("react").JSX.Element;
export declare function AppStoreSignals({ snapshot, appeekyUrl }: {
    snapshot: AppeekySnapshot | null;
    appeekyUrl: string;
}): import("react").JSX.Element;
