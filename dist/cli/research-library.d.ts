export interface ResearchLibraryOptions {
    root: string;
    project?: string;
    bucket?: string;
    objectPrefix?: string;
    catalogDir?: string;
    localRoot?: string;
    gcloud?: string;
}
export declare function initResearchLibrary(options: ResearchLibraryOptions): Promise<number>;
export declare function runResearchLibrary(command: string, args: string[], options: ResearchLibraryOptions): Promise<number>;
