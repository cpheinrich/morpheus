export type RelationshipKind = "roadmap" | "pull_request" | "issue" | "links_to" | "supersedes";
export interface ContextRelationship {
    kind: RelationshipKind;
    from: string;
    to: string;
    sourceLine: number;
}
interface Source {
    path: string;
    text: string;
}
/** Derive explicit relationships from the same eligible records used by search. */
export declare function buildRelationships(sources: readonly Source[], origin?: string): ContextRelationship[];
export interface RelatedRelationship extends ContextRelationship {
    depth: number;
    direction: "outgoing" | "incoming";
}
/** Traverse explicit edges in either direction, retaining their original provenance. */
export declare function relatedContext(edges: readonly ContextRelationship[], path: string, depth?: number, limit?: number): {
    relationships: RelatedRelationship[];
    truncated: boolean;
};
export {};
