export declare function productGuideTopics(): string[];
export declare function productSkillDescription(skill?: string): string;
export type ProductGuide = {
    ok: true;
    text: string;
} | {
    ok: false;
    message: string;
};
export declare function productGuide(topic?: string): ProductGuide;
