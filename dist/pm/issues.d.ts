export declare class IssueLinkError extends Error {
}
/** Parse the exact decimal syntax GitHub uses for issue numbers. */
export declare function parseIssueNumber(raw: string): number | null;
export interface LinkIssueResult {
    path: string;
    issues: number[];
    written: boolean;
}
/** Add closure intent to an existing roadmap item without reformatting it. */
export declare function linkIssue(productDir: string, id: string, issue: number, now?: Date): Promise<LinkIssueResult>;
