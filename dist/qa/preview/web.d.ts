import { type Run } from "./ios.js";
/**
 * `morpheus qa preview web` — comment QA on a local website (MO-26-10-06-18.13.32).
 *
 * The project declares its dev server in `morpheus.json` `qa.web`. `start` attaches to the dev
 * server if it is already answering, or starts the declared command under a launchd supervisor,
 * then puts the comment overlay (a proxy that injects the toolbar) in front of it. `stop` ends the
 * overlay and only a dev server this preview started.
 */
export interface WebPreviewConfig {
    /** The dev server's origin, e.g. http://localhost:5173 — local only. */
    url: string;
    /**
     * Starts the dev server when it is not already running; omitted, the preview only attaches. With a
     * `{port}` placeholder the preview takes the site's own address: the dev server runs on a spare
     * port and the overlay listens on `url`'s port, so sign-in allowlists, cookies and redirects see
     * exactly the address they were configured for (MO-26-10-06-22.17.47).
     */
    command?: string[];
    /** Working directory for the command, relative to the project root. */
    cwd: string;
    /** The page to open first, e.g. /hq. */
    path: string;
    namespace: string;
}
export type WebConfigResult = {
    ok: true;
    config: WebPreviewConfig;
} | {
    ok: false;
    issues: string[];
};
export declare function parseWebPreviewConfig(raw: unknown, projectName?: string): WebConfigResult;
export declare function loadWebPreviewConfig(root: string): Promise<WebConfigResult>;
export interface WebPreviewOptions {
    command: "start" | "status" | "stop";
    port?: number;
    ttlMinutes?: number;
    path?: string;
    sshHost?: string;
}
export declare function parseWebPreviewArgs(argv: string[]): WebPreviewOptions;
export declare function webKey(root: string, config: Pick<WebPreviewConfig, "cwd">): string;
/** 4300–4555, spread per checkout, clear of the iOS preview's 3200–3711. */
export declare function defaultWebPort(key: string): number;
/** The page to open: the dev server's own hostname, so its cookies (a signed-in session) apply. */
export declare function overlayUrl(upstream: string, port: number, path: string): string;
/** True when the dev command can be told its port, so the overlay can take the site's own address. */
export declare function frontable(config: Pick<WebPreviewConfig, "command">): boolean;
/** The site's address when the overlay holds it (own-address mode), else undefined. */
export declare function frontedSite(state: Pick<WebPreviewState, "site" | "port">): string | undefined;
export declare function sitePort(url: string): number;
/** The first port after `from` that is free on loopback, for the relocated dev server. */
export declare function spareDevPort(from: number, exclude: number, attempts?: number): Promise<number>;
export interface WebPreviewState {
    /** `upstream` is where the dev server answers; `site` is the address people open (its own, when fronted). */
    root: string;
    upstream: string;
    site?: string;
    port: number;
    path: string;
    expiresAt: number;
    /** True when this preview started the dev server and so owns stopping it. */
    spawned: boolean;
    command?: string[];
    cwd: string;
    project: string;
}
interface WebContext {
    root: string;
    config: WebPreviewConfig;
    key: string;
    stateDir: string;
    stateFile: string;
    label: string;
    target: string;
    run: Run;
    log: (l: string) => void;
}
export declare function webContext(root: string, config: WebPreviewConfig, run?: Run, log?: (l: string) => void): WebContext;
/** Healthy when our overlay answers on its port and names this dev server as its upstream. */
export declare function webHealthy(state: WebPreviewState | undefined): Promise<boolean>;
export declare function runWebPreview(ctx: WebContext, options: WebPreviewOptions, project: string): Promise<void>;
export {};
