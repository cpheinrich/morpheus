/**
 * The production web QA contract (MO-26-11-15-18.52.12), shared by the browser panel
 * (`morpheus-kit/qa/web`) and a site's own server route (`morpheus-kit/qa/web/schema`).
 *
 * The payload is deliberately small: a pathname, a normalized click point, the viewport size and an
 * optional token the site itself placed in `data-qa-anchor`. Nothing here can carry page text,
 * markup, input values, screenshots or a selector the panel invented, because a production page
 * holds real customers' data. Objects are strict so an extra field is a rejection, not a leak.
 */
import { z } from "zod";
export declare const WEB_QA_LIMITS: {
    readonly comments: 20;
    readonly textChars: 2000;
    readonly pathChars: 2048;
    readonly anchorChars: 64;
    readonly viewportMax: 16384;
    readonly scrollMax: 1000000;
};
/** An explicit `data-qa-anchor` value: a short, opaque identifier the site chose to expose. */
export declare const WEB_QA_ANCHOR: RegExp;
/**
 * Why a path is not a plain pathname, or null when it is one. A path must be what
 * `location.pathname` yields: absolute, no query or fragment, no backslash (some servers treat it
 * as a separator), no leading `//` (a protocol-relative URL), no dot segments, and no control
 * character either raw or percent-escaped.
 */
export declare function webQaPathIssue(path: string): string | null;
export declare const WebQaScope: z.ZodEnum<{
    view: "view";
    element: "element";
    page: "page";
}>;
export type WebQaScope = z.infer<typeof WebQaScope>;
export declare const WebQaComment: z.ZodObject<{
    text: z.ZodString;
    path: z.ZodString;
    scope: z.ZodEnum<{
        view: "view";
        element: "element";
        page: "page";
    }>;
    x: z.ZodNumber;
    y: z.ZodNumber;
    viewportWidth: z.ZodNumber;
    viewportHeight: z.ZodNumber;
    scrollX: z.ZodOptional<z.ZodNumber>;
    scrollY: z.ZodOptional<z.ZodNumber>;
    anchor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type WebQaComment = z.infer<typeof WebQaComment>;
export declare const WebQaBatch: z.ZodObject<{
    batchId: z.ZodUUID;
    comments: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        path: z.ZodString;
        scope: z.ZodEnum<{
            view: "view";
            element: "element";
            page: "page";
        }>;
        x: z.ZodNumber;
        y: z.ZodNumber;
        viewportWidth: z.ZodNumber;
        viewportHeight: z.ZodNumber;
        scrollX: z.ZodOptional<z.ZodNumber>;
        scrollY: z.ZodOptional<z.ZodNumber>;
        anchor: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    buildAndDeploy: z.ZodBoolean;
    makeFeatureFlag: z.ZodBoolean;
}, z.core.$strict>;
export type WebQaBatch = z.infer<typeof WebQaBatch>;
export declare const WebQaReceipt: z.ZodObject<{
    batchId: z.ZodUUID;
    factory: z.ZodEnum<{
        queued: "queued";
        retry: "retry";
        "not-requested": "not-requested";
    }>;
}, z.core.$strict>;
export type WebQaReceipt = z.infer<typeof WebQaReceipt>;
/**
 * Validate an untrusted request body. The schema checks shape only: the site's route must still
 * authenticate the caller, authorize QA for that account, and decide whether each `path` is a page
 * this account may comment on. Resubmitting a `batchId` is a retry and must not create a second
 * batch or a second build request.
 */
export declare function parseWebQaBatch(value: unknown): z.ZodSafeParseResult<{
    batchId: string;
    comments: {
        text: string;
        path: string;
        scope: "view" | "element" | "page";
        x: number;
        y: number;
        viewportWidth: number;
        viewportHeight: number;
        scrollX?: number | undefined;
        scrollY?: number | undefined;
        anchor?: string | undefined;
    }[];
    buildAndDeploy: boolean;
    makeFeatureFlag: boolean;
}>;
export declare function parseWebQaReceipt(value: unknown): z.ZodSafeParseResult<{
    batchId: string;
    factory: "queued" | "retry" | "not-requested";
}>;
