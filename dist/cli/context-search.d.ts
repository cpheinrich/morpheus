export declare function runTaskRead(cwd: string, args: string[], session?: string | undefined): Promise<number>;
interface SearchOptions {
    json: boolean;
    maxTokens?: string;
    sessionId?: string;
}
export declare function runContextSearch(cwd: string, query: string, options: SearchOptions): Promise<number>;
export declare function runContextCoverage(cwd: string, json: boolean): Promise<number>;
export declare function runContextEngine(cwd: string, args: string[], session?: string | undefined): Promise<number>;
export {};
