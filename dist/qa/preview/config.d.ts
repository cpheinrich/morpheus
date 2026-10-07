/**
 * `morpheus.json` → `qa.ios`: what one project's iOS preview needs, and nothing Morpheus can know.
 *
 * The lifecycle (simulator, serve-sim, supervisor, lease, overlay) is shared; the app is not. A
 * project declares how to build itself, where the product lands, its bundle id, and the launch
 * modes it offers. Placeholders `{key}` (the checkout key) and `{root}` (the project root) are
 * expanded in commands, paths and arguments.
 *
 * Evo was the first consumer, so `namespace` and `device.name` exist to keep its running previews
 * addressable across the move: a preview started by Evo's own script keeps its launchd label,
 * state directory and simulator name.
 */
export interface PreviewMode {
    name: string;
    /** Launch arguments passed to the app. */
    args: string[];
    /** Command-line flags that select this mode, e.g. `--demo`. `--mode <name>` always works. */
    flags: string[];
    /** One line printed when the preview is ready, saying what the person is looking at. */
    summary: string;
    /**
     * A command whose stdout is `{"env": {...}}`. Each entry reaches the app as a launch environment
     * variable (`SIMCTL_CHILD_<NAME>`). stdout stays in memory; it never enters arguments, state
     * files or launchd. With `credentials: true` it runs under `morpheus credentials run --`.
     */
    prepare?: {
        command: string[];
        credentials: boolean;
    };
}
export interface IosPreviewConfig {
    /** Directory of the iOS app, relative to the project root. The checkout key derives from it. */
    app: string;
    build: string[];
    precheck?: string[];
    /** The built `.app`, relative to DerivedData. */
    product: string;
    /** DerivedData directory; `{key}` keeps two checkouts apart. */
    derivedData: string;
    bundleId: string;
    device: {
        name: string;
        type: string;
    };
    /** launchd label and cache-directory prefix. */
    namespace: string;
    /** e.g. "26.5". */
    minimumXcode: string;
    defaultMode: string;
    modes: Record<string, PreviewMode>;
}
export type ConfigResult = {
    ok: true;
    config: IosPreviewConfig;
} | {
    ok: false;
    issues: string[];
};
/** Validates `qa.ios`, reporting every problem rather than the first. */
export declare function parseIosPreviewConfig(raw: unknown, projectName?: string): ConfigResult;
/** Flags the preview command owns, plus every flag the morpheus parser consumes first. */
export declare const PREVIEW_FLAGS: string[];
export declare const RESERVED_FLAGS: Set<string>;
export declare function loadIosPreviewConfig(root: string): Promise<ConfigResult>;
/** Expands `{key}` and `{root}`. */
export declare function expand(value: string, vars: {
    key: string;
    root: string;
}): string;
