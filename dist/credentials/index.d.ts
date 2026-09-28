export interface CredentialsConfig {
    repository: string;
    path: string;
    command?: string;
    legacyRepositories?: string[];
    legacyEnvironment?: string[];
}
export declare const POINTER = ".morpheus/credentials.json";
export declare function repositoryId(url: string): string;
export declare function projectRoots(cwd: string): {
    root: string;
    primary: string;
    common: string;
};
export declare function readConfig(root: string): CredentialsConfig;
export declare function locate(cwd: string, env?: NodeJS.ProcessEnv): {
    config: CredentialsConfig;
    path: string;
    root: string;
    primary: string;
    common: string;
};
/** Prefer the project's actual GitHub organization; scaffold still works offline before git init. */
export declare function scaffoldConfig(root: string, owner: string): CredentialsConfig;
export declare function configure(cwd: string, repository: string, options?: {
    path?: string;
    command?: string;
}): void;
export declare function credentials(argv: string[], cwd?: string): number;
