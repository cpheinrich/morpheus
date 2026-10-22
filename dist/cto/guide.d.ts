/** Each reference file, by the name `morpheus cto guide <topic>` takes. */
export declare function ctoGuideTopics(): string[];
/** The skill's `description`, which a pointer copies so both route the same requests. */
export declare function ctoSkillDescription(): string;
export type CtoGuide = {
    ok: true;
    text: string;
} | {
    ok: false;
    message: string;
};
/** The entrypoint with no topic, or one reference file verbatim. */
export declare function ctoGuide(topic?: string): CtoGuide;
