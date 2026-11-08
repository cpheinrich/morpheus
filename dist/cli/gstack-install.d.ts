export type GstackHost = "codex" | "claude";
export declare function ensureGstack(host: GstackHost): Promise<{
    release: string;
    skills: string;
    env: {
        GSTACK_ROOT: string;
        GSTACK_HOME: string;
        GSTACK_STATE_ROOT: string;
        GSTACK_SKIP_ASIDE: string;
        PLAYWRIGHT_BROWSERS_PATH: string;
        CODEX_HOME: string;
        CLAUDE_CONFIG_DIR: string;
        HOME: string;
    };
    pathPrefix: string;
}>;
