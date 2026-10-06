import { type IosPreviewConfig, type PreviewMode } from "./config.js";
/**
 * `morpheus qa preview ios` — one managed simulator preview per checkout, with the comment overlay.
 *
 * Moved from Evo's `apps/ios/scripts/preview.mjs` (MO-26-10-06-15.17.01) so a second app can use it.
 * serve-sim owns streaming, input and screenshots; this owns the lifecycle around it. The rules it
 * keeps were each learned on a real device and are not decoration:
 *
 * - launchd owns exactly this preview. Never kill all serve-sim streams, erase a simulator, or
 *   shut down a device whose name does not prove it belongs to this checkout.
 * - A preview survives its terminal but not its lease (four hours by default): it never holds a
 *   booted device indefinitely.
 * - Xcode 27's Device Hub can shadow CoreSimulator's touch service; repair it before launching.
 * - Credentials for a live mode pass through memory only.
 */
export type Run = (command: string, args: string[], options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: "inherit" | "pipe";
}) => string;
export declare const defaultRun: Run;
export interface PreviewOptions {
    command: "start" | "status" | "stop" | "doctor";
    mode?: string;
    port?: number;
    ttlMinutes?: number;
    build: boolean;
    sshHost?: string;
}
/** Overlay port follows the preview port, so two checkouts' overlays differ. */
export declare const OVERLAY_PORT_OFFSET = 256;
export declare const DEFAULT_TTL_MINUTES = 240;
export declare function parsePreviewArgs(argv: string[], modes: Record<string, PreviewMode>): PreviewOptions;
/** The checkout key: the first 12 hex of SHA-256 over the app directory's absolute path. */
export declare function checkoutKey(root: string, config: Pick<IosPreviewConfig, "app">): string;
/** A per-checkout default port in 3200–3455, so two projects' previews do not collide by default. */
export declare function defaultPort(key: string): number;
export interface Runtime {
    identifier: string;
    version: string;
    isAvailable: boolean;
    supportedDeviceTypes?: {
        name: string;
        identifier: string;
        productFamily: string;
    }[];
}
export declare function selectRuntime(runtimes: Runtime[]): Runtime;
export declare function launchPlist({ label, args, cwd, log, env }: {
    label: string;
    args: string[];
    cwd: string;
    log: string;
    env: Record<string, string>;
}): string;
/** Forwards only the overlay: it proxies the stream and input server-side, so one port suffices. */
export declare function tunnelCommand(host: string, port: number): string;
export declare function requireFreePort(port: number): Promise<void>;
/** Xcode 27 Device Hub can shadow CoreSimulator's legacy touch/keyboard service. */
export declare function repairSimulatorInput(udid: string, run?: Run): boolean;
/** Shut down this preview's simulator, and only if its name proves this checkout owns it. */
export declare function shutdownPreview(state: {
    udid: string;
    name: string;
}, ownerName: string, sim: (...args: string[]) => string): void;
/**
 * Turns a prepare command's stdout into the app's launch environment. Only `{"env": {...}}` with
 * string values is accepted; names must be environment-variable shaped.
 */
export declare function launchEnvironment(prepared: string): Record<string, string>;
export declare function withPreviewCancellation<T>(operation: (check: () => void) => Promise<T>, cleanup: () => Promise<void>, signals?: NodeJS.EventEmitter): Promise<T>;
/** serve-sim's CLI. Its exports hide the file, so it is found beside an exported entry. */
export declare function serveSimCli(): {
    path: string;
    version: string;
};
export interface PreviewState {
    udid: string;
    name: string;
    port: number;
    overlayPort: number;
    root: string;
    expiresAt: number;
    mode?: string;
    build?: string;
}
export interface PreviewContext {
    root: string;
    config: IosPreviewConfig;
    key: string;
    stateDir: string;
    stateFile: string;
    label: string;
    target: string;
    deviceName: string;
    run: Run;
    log: (line: string) => void;
}
export declare function previewContext(root: string, config: IosPreviewConfig, run?: Run, log?: (line: string) => void): PreviewContext;
/** The preview is healthy when launchd's job owns serve-sim on our port and both pages answer. */
export declare function healthy(ctx: PreviewContext, state: PreviewState | undefined): Promise<boolean>;
export declare function report(ctx: PreviewContext, state: PreviewState, options: Pick<PreviewOptions, "sshHost">): void;
export declare function prerequisites(ctx: PreviewContext): Runtime;
export declare function stopPreview(ctx: PreviewContext): Promise<void>;
export declare function runPreview(ctx: PreviewContext, options: PreviewOptions): Promise<void>;
