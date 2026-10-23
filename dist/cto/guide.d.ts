/**
 * Every topic `morpheus cto guide <topic>` takes: each CTO reference, then each
 * individual-contributor skill followed by its references.
 */
export declare function ctoGuideTopics(): string[];
/** A skill's `description`, which a pointer copies so both route the same requests. */
export declare function ctoSkillDescription(skill?: string): string;
export type CtoGuide = {
    ok: true;
    text: string;
} | {
    ok: false;
    message: string;
};
/**
 * With no topic, the CTO entrypoint; with a CTO reference's name, that reference verbatim; with an
 * individual-contributor skill's name, its entrypoint; with `<skill>/<reference>`, that reference.
 */
export declare function ctoGuide(topic?: string): CtoGuide;
