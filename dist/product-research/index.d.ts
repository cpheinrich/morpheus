import { z } from "zod";
/**
 * The browser-safe contract for a host app research study and its App Store signals. Parsing is
 * strict about everything the viewer or the importer acts on — paths, hashes, ids and the
 * references between them — and keeps unknown study keys as data, so a newer capture tool can add
 * fields without a lockstep release here.
 */
/** iPhone point canvas used when an element's bounds are in points (the default space). */
export declare const APP_RESEARCH_POINT_CANVAS: {
    readonly width: 393;
    readonly height: 852;
};
export declare const STUDY_FILE = "study.json";
type ValidationIssue = {
    path: string;
    message: string;
};
export declare class ProductResearchValidationError extends Error {
    readonly kind: "study" | "snapshot";
    readonly issues: ValidationIssue[];
    constructor(kind: "study" | "snapshot", issues: ValidationIssue[]);
}
/**
 * A relative path inside the study directory: plain segments only, so no absolute path, parent
 * traversal, backslash, query or fragment can reach storage or the filesystem.
 */
export declare function isSafeAssetPath(value: string): boolean;
declare const flowSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    entryScreenId: z.ZodString;
    parentFlowId: z.ZodOptional<z.ZodString>;
    screenIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
declare const studySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    studyId: z.ZodString;
    capturedAt: z.ZodISODateTime;
    device: z.ZodObject<{
        model: z.ZodString;
        osVersion: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>;
    app: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        version: z.ZodString;
        status: z.ZodString;
        summary: z.ZodString;
        entryScreenId: z.ZodString;
        screens: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            state: z.ZodString;
            description: z.ZodString;
            elements: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                role: z.ZodString;
                behavior: z.ZodString;
                status: z.ZodString;
                bounds: z.ZodNullable<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                    width: z.ZodNumber;
                    height: z.ZodNumber;
                }, z.core.$strip>>;
                boundsSpace: z.ZodOptional<z.ZodEnum<{
                    points: "points";
                    pixels: "pixels";
                    normalized: "normalized";
                }>>;
                evidence: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                screenshotPath: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
            screenshots: z.ZodPipe<z.ZodNullable<z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                accessibility: z.ZodOptional<z.ZodString>;
                capturedAt: z.ZodISODateTime;
                position: z.ZodOptional<z.ZodUnknown>;
                sha256: z.ZodString;
                width: z.ZodNumber;
                height: z.ZodNumber;
                layoutRegions: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
            }, z.core.$loose>>>, z.ZodTransform<{
                [x: string]: unknown;
                path: string;
                capturedAt: string;
                sha256: string;
                width: number;
                height: number;
                accessibility?: string | undefined;
                position?: unknown;
                layoutRegions?: unknown[] | undefined;
            }[], {
                [x: string]: unknown;
                path: string;
                capturedAt: string;
                sha256: string;
                width: number;
                height: number;
                accessibility?: string | undefined;
                position?: unknown;
                layoutRegions?: unknown[] | undefined;
            }[] | null>>;
        }, z.core.$loose>>;
        flows: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            entryScreenId: z.ZodString;
            parentFlowId: z.ZodOptional<z.ZodString>;
            screenIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$loose>>>;
        transitions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            actionId: z.ZodString;
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
            elementId: z.ZodNullable<z.ZodString>;
            action: z.ZodString;
            result: z.ZodString;
            status: z.ZodString;
            beforeScreenshot: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            afterScreenshot: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            precondition: z.ZodOptional<z.ZodString>;
            sideEffects: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
        }, z.core.$loose>>;
        gaps: z.ZodArray<z.ZodUnknown>;
        replayChecks: z.ZodArray<z.ZodUnknown>;
        metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$loose>;
    assets: z.ZodRecord<z.ZodString, z.ZodObject<{
        bytes: z.ZodNumber;
        sha256: z.ZodString;
        contentType: z.ZodString;
    }, z.core.$strip>>;
    downloads: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        path: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$loose>;
export type AppResearchStudy = z.output<typeof studySchema>;
export type AppResearchScreen = AppResearchStudy["app"]["screens"][number];
export type AppResearchFlow = z.output<typeof flowSchema>;
export type AppResearchElement = AppResearchScreen["elements"][number];
export type AppResearchScreenshot = AppResearchScreen["screenshots"][number];
export type AppResearchTransition = AppResearchStudy["app"]["transitions"][number];
export type AppResearchAsset = AppResearchStudy["assets"][string];
export declare function parseAppResearchStudy(input: unknown): AppResearchStudy;
declare const snapshotSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    source: z.ZodLiteral<"appeeky">;
    appId: z.ZodString;
    country: z.ZodString;
    device: z.ZodEnum<{
        iphone: "iphone";
        ipad: "ipad";
    }>;
    fetchedAt: z.ZodISODateTime;
    listing: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        category: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
        releasedAt: z.ZodOptional<z.ZodString>;
        rating: z.ZodOptional<z.ZodNumber>;
        ratingCount: z.ZodOptional<z.ZodNumber>;
        downloadPrice: z.ZodOptional<z.ZodNumber>;
        currency: z.ZodOptional<z.ZodString>;
        appStoreUrl: z.ZodOptional<z.ZodURL>;
    }, z.core.$strip>;
    keywords: z.ZodArray<z.ZodObject<{
        term: z.ZodString;
        branded: z.ZodBoolean;
        rank: z.ZodNullable<z.ZodNumber>;
        rankChange7d: z.ZodOptional<z.ZodNumber>;
        volumeScore: z.ZodOptional<z.ZodNumber>;
        difficulty: z.ZodOptional<z.ZodNumber>;
        status: z.ZodOptional<z.ZodEnum<{
            missing: "missing";
            ranked: "ranked";
            unranked: "unranked";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AppeekySnapshot = z.output<typeof snapshotSchema>;
export type AppeekyKeyword = AppeekySnapshot["keywords"][number];
export declare function parseAppeekySnapshot(input: unknown): AppeekySnapshot;
export {};
