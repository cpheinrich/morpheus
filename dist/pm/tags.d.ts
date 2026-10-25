import { type ParseIssue } from "./parse.js";
export interface TaggedWork {
    kind: "roadmap" | "worklog";
    path: string;
    roadmap?: string;
    tags: string[];
    summary: string;
}
/** Explicit AND matching, with unclassified legacy history and parse failures kept distinct. */
export declare function taggedWork(root: string, productDir: string, requested: string[]): Promise<{
    items: TaggedWork[];
    issues: ParseIssue[];
    unclassifiedWorklogs: number;
}>;
