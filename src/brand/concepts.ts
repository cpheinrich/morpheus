import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const CONCEPT_REVIEW_FILE = "research/brand.html";
export const CONCEPT_REVIEW_META_NAME = "morpheus-brand-review";
export const CONCEPT_REVIEW_VIEWS = ["system", "home", "marketing", "type", "compare"] as const;
export const CONCEPT_REVIEW_CONCEPT_ATTRIBUTE = "data-morpheus-concept";
export const CONCEPT_REVIEW_VIEW_ATTRIBUTE = "data-morpheus-view";

/**
 * The metadata is intentionally tiny and portable. It lets Morpheus check a
 * handcrafted static page without prescribing a framework or its visual
 * expression. A later session can add concepts, but may not quietly reduce the
 * initial five comparable packages to a single moodboard.
 */
export const conceptReviewMeta = (count = 5): string =>
  `<meta name="${CONCEPT_REVIEW_META_NAME}" content="concepts=${count}; views=${CONCEPT_REVIEW_VIEWS.join(",")}">`;

export async function checkConceptReview(dir: string): Promise<string | null> {
  let html: string;
  try {
    html = await readFile(join(dir, CONCEPT_REVIEW_FILE), "utf8");
  } catch {
    return "missing";
  }

  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((candidate) =>
    new RegExp(`\\bname=["']${CONCEPT_REVIEW_META_NAME}["']`, "i").test(candidate),
  );
  const content = tag ? /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1] : undefined;
  if (!content) {
    return `missing <meta name="${CONCEPT_REVIEW_META_NAME}"> contract`;
  }

  const count = /(?:^|;)\s*concepts=(\d+)/.exec(content);
  if (!count || Number(count[1]) < 5) return "must contain at least five comparable concepts";

  const conceptCount = (html.match(new RegExp(`\\b${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}=["'][^"']+["']`, "gi")) ?? []).length;
  if (conceptCount < Number(count[1])) {
    return `declares ${count[1]} concepts but marks only ${conceptCount} with ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}`;
  }

  const views = /(?:^|;)\s*views=([^;]+)/.exec(content)?.[1]
    ?.split(",")
    .map((view) => view.trim()) ?? [];
  const missing = CONCEPT_REVIEW_VIEWS.filter((view) => !views.includes(view));
  if (missing.length) return `missing ${missing.join(", ")} view${missing.length === 1 ? "" : "s"}`;

  const unmarkedViews = CONCEPT_REVIEW_VIEWS.filter(
    (view) => !new RegExp(`\\b${CONCEPT_REVIEW_VIEW_ATTRIBUTE}=["']${view}["']`, "i").test(html),
  );
  return unmarkedViews.length
    ? `does not mark ${unmarkedViews.join(", ")} panel${unmarkedViews.length === 1 ? "" : "s"}`
    : null;
}
