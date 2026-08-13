export declare const CONCEPT_REVIEW_FILE = "research/brand.html";
export declare const CONCEPT_REVIEW_META_NAME = "morpheus-brand-review";
export declare const CONCEPT_REVIEW_VIEWS: readonly ["system", "home", "marketing", "type", "compare"];
export declare const CONCEPT_REVIEW_CONCEPT_ATTRIBUTE = "data-morpheus-concept";
export declare const CONCEPT_REVIEW_VIEW_ATTRIBUTE = "data-morpheus-view";
/**
 * The metadata is intentionally tiny and portable. It lets Morpheus check a
 * handcrafted static page without prescribing a framework or its visual
 * expression. A later session can add concepts, but may not quietly reduce the
 * initial five comparable packages to a single moodboard.
 */
export declare const conceptReviewMeta: (count?: number) => string;
export declare function checkConceptReview(dir: string): Promise<string | null>;
