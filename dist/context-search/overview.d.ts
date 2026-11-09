/** Portable pointers for a fresh agent. Contents and absolute host paths stay in the project. */
export declare function contextOverview(root: string, task?: string): Promise<{
    project: string | undefined;
    architecture: {
        source: string;
        sections: {
            title: "Project manifest" | "Instruction layering" | "The work loop" | "Agent records" | "Context freshness" | "Project management" | "Factory distribution and responsibilities";
            href: string;
        }[];
    };
    projectRecords: {
        purpose: string;
        path: string;
    }[];
    task: {
        id: string;
        roadmap: string | undefined;
        next: string;
    } | undefined;
    operatingModel: string[];
    handoff: string;
}>;
