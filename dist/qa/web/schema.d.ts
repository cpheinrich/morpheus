/**
 * The production web QA contract (MO-26-11-15-18.52.12), shared by the browser panel
 * (`morpheus-kit/qa/web`) and a site's own server route (`morpheus-kit/qa/web/schema`).
 *
 * The payload is deliberately small: a pathname, a normalized click point, the viewport size and an
 * optional token the site itself placed in `data-qa-anchor`. Opted-in clients can attach a
 * redacted JPEG and bounded diagnostics. Objects are strict: no markup, raw logs or selectors.
 */
import { z } from "zod";
export declare const WEB_QA_LIMITS: {
    readonly comments: 20;
    readonly textChars: 2000;
    readonly notesChars: 2000;
    readonly pathChars: 2048;
    readonly anchorChars: 64;
    readonly viewportMax: 16384;
    readonly scrollMax: 1000000;
};
export declare const WEB_QA_MAX_BODY_BYTES: number;
export declare const WEB_QA_JPEG_MAX_CHARS = 100000;
export declare const WEB_QA_JPEG_MAX_EDGE = 1280;
export declare const WEB_QA_COUNT_MAX = 4096;
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
export declare const WebQaEvidenceInput: z.ZodEnum<{
    page: "page";
    "left-click": "left-click";
    "right-click": "right-click";
    keyboard: "keyboard";
}>;
export type WebQaEvidenceInput = z.infer<typeof WebQaEvidenceInput>;
export declare const WebQaEvidenceReason: z.ZodEnum<{
    unsupported: "unsupported";
    interrupted: "interrupted";
    "snapshot-limit": "snapshot-limit";
    "render-failed": "render-failed";
    "image-too-large": "image-too-large";
    "storage-unavailable": "storage-unavailable";
}>;
export declare const WebQaEvidenceElement: z.ZodObject<{
    tag: z.ZodEnum<{
        main: "main";
        a: "a";
        summary: "summary";
        other: "other";
        body: "body";
        label: "label";
        dialog: "dialog";
        span: "span";
        header: "header";
        footer: "footer";
        button: "button";
        article: "article";
        form: "form";
        img: "img";
        table: "table";
        div: "div";
        p: "p";
        ol: "ol";
        li: "li";
        h2: "h2";
        ul: "ul";
        aside: "aside";
        details: "details";
        h1: "h1";
        h3: "h3";
        nav: "nav";
        section: "section";
        td: "td";
    }>;
    role: z.ZodOptional<z.ZodEnum<{
        link: "link";
        status: "status";
        list: "list";
        main: "main";
        dialog: "dialog";
        button: "button";
        menu: "menu";
        checkbox: "checkbox";
        heading: "heading";
        listitem: "listitem";
        menuitem: "menuitem";
        navigation: "navigation";
        region: "region";
        switch: "switch";
        tab: "tab";
        tablist: "tablist";
        tabpanel: "tabpanel";
    }>>;
    expanded: z.ZodOptional<z.ZodBoolean>;
    pressed: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
        mixed: "mixed";
    }>>;
    selected: z.ZodOptional<z.ZodBoolean>;
    position: z.ZodEnum<{
        fixed: "fixed";
        static: "static";
        relative: "relative";
        absolute: "absolute";
        sticky: "sticky";
    }>;
    width: z.ZodNumber;
    height: z.ZodNumber;
    scrollLeft: z.ZodOptional<z.ZodNumber>;
    scrollTop: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const WebQaEvidenceStatus: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"captured">;
    jpegBase64: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"unavailable">;
    reason: z.ZodEnum<{
        unsupported: "unsupported";
        interrupted: "interrupted";
        "snapshot-limit": "snapshot-limit";
        "render-failed": "render-failed";
        "image-too-large": "image-too-large";
        "storage-unavailable": "storage-unavailable";
    }>;
}, z.core.$strict>], "kind">;
export declare const WebQaEvidence: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    capturedAt: z.ZodISODateTime;
    input: z.ZodEnum<{
        page: "page";
        "left-click": "left-click";
        "right-click": "right-click";
        keyboard: "keyboard";
    }>;
    browser: z.ZodDiscriminatedUnion<[z.ZodObject<{
        family: z.ZodEnum<{
            Unknown: "Unknown";
            Chromium: "Chromium";
            Chrome: "Chrome";
            Edge: "Edge";
            Firefox: "Firefox";
            Safari: "Safari";
            Opera: "Opera";
            "Samsung Internet": "Samsung Internet";
        }>;
        versionSource: z.ZodLiteral<"user-agent">;
        version: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        family: z.ZodEnum<{
            Unknown: "Unknown";
            Chromium: "Chromium";
            Chrome: "Chrome";
            Edge: "Edge";
            Firefox: "Firefox";
            Safari: "Safari";
            Opera: "Opera";
            "Samsung Internet": "Samsung Internet";
        }>;
        versionSource: z.ZodLiteral<"unavailable">;
    }, z.core.$strict>], "versionSource">;
    os: z.ZodEnum<{
        iOS: "iOS";
        Unknown: "Unknown";
        Android: "Android";
        macOS: "macOS";
        Windows: "Windows";
        ChromeOS: "ChromeOS";
        Linux: "Linux";
    }>;
    dpr: z.ZodOptional<z.ZodNumber>;
    theme: z.ZodEnum<{
        dark: "dark";
        light: "light";
    }>;
    elements: z.ZodOptional<z.ZodArray<z.ZodObject<{
        tag: z.ZodEnum<{
            main: "main";
            a: "a";
            summary: "summary";
            other: "other";
            body: "body";
            label: "label";
            dialog: "dialog";
            span: "span";
            header: "header";
            footer: "footer";
            button: "button";
            article: "article";
            form: "form";
            img: "img";
            table: "table";
            div: "div";
            p: "p";
            ol: "ol";
            li: "li";
            h2: "h2";
            ul: "ul";
            aside: "aside";
            details: "details";
            h1: "h1";
            h3: "h3";
            nav: "nav";
            section: "section";
            td: "td";
        }>;
        role: z.ZodOptional<z.ZodEnum<{
            link: "link";
            status: "status";
            list: "list";
            main: "main";
            dialog: "dialog";
            button: "button";
            menu: "menu";
            checkbox: "checkbox";
            heading: "heading";
            listitem: "listitem";
            menuitem: "menuitem";
            navigation: "navigation";
            region: "region";
            switch: "switch";
            tab: "tab";
            tablist: "tablist";
            tabpanel: "tabpanel";
        }>>;
        expanded: z.ZodOptional<z.ZodBoolean>;
        pressed: z.ZodOptional<z.ZodEnum<{
            true: "true";
            false: "false";
            mixed: "mixed";
        }>>;
        selected: z.ZodOptional<z.ZodBoolean>;
        position: z.ZodEnum<{
            fixed: "fixed";
            static: "static";
            relative: "relative";
            absolute: "absolute";
            sticky: "sticky";
        }>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        scrollLeft: z.ZodOptional<z.ZodNumber>;
        scrollTop: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>>;
    resources: z.ZodOptional<z.ZodNumber>;
    errorsSinceMount: z.ZodOptional<z.ZodNumber>;
    status: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"captured">;
        jpegBase64: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"unavailable">;
        reason: z.ZodEnum<{
            unsupported: "unsupported";
            interrupted: "interrupted";
            "snapshot-limit": "snapshot-limit";
            "render-failed": "render-failed";
            "image-too-large": "image-too-large";
            "storage-unavailable": "storage-unavailable";
        }>;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>;
export type WebQaEvidence = z.infer<typeof WebQaEvidence>;
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
    evidence: z.ZodOptional<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        capturedAt: z.ZodISODateTime;
        input: z.ZodEnum<{
            page: "page";
            "left-click": "left-click";
            "right-click": "right-click";
            keyboard: "keyboard";
        }>;
        browser: z.ZodDiscriminatedUnion<[z.ZodObject<{
            family: z.ZodEnum<{
                Unknown: "Unknown";
                Chromium: "Chromium";
                Chrome: "Chrome";
                Edge: "Edge";
                Firefox: "Firefox";
                Safari: "Safari";
                Opera: "Opera";
                "Samsung Internet": "Samsung Internet";
            }>;
            versionSource: z.ZodLiteral<"user-agent">;
            version: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            family: z.ZodEnum<{
                Unknown: "Unknown";
                Chromium: "Chromium";
                Chrome: "Chrome";
                Edge: "Edge";
                Firefox: "Firefox";
                Safari: "Safari";
                Opera: "Opera";
                "Samsung Internet": "Samsung Internet";
            }>;
            versionSource: z.ZodLiteral<"unavailable">;
        }, z.core.$strict>], "versionSource">;
        os: z.ZodEnum<{
            iOS: "iOS";
            Unknown: "Unknown";
            Android: "Android";
            macOS: "macOS";
            Windows: "Windows";
            ChromeOS: "ChromeOS";
            Linux: "Linux";
        }>;
        dpr: z.ZodOptional<z.ZodNumber>;
        theme: z.ZodEnum<{
            dark: "dark";
            light: "light";
        }>;
        elements: z.ZodOptional<z.ZodArray<z.ZodObject<{
            tag: z.ZodEnum<{
                main: "main";
                a: "a";
                summary: "summary";
                other: "other";
                body: "body";
                label: "label";
                dialog: "dialog";
                span: "span";
                header: "header";
                footer: "footer";
                button: "button";
                article: "article";
                form: "form";
                img: "img";
                table: "table";
                div: "div";
                p: "p";
                ol: "ol";
                li: "li";
                h2: "h2";
                ul: "ul";
                aside: "aside";
                details: "details";
                h1: "h1";
                h3: "h3";
                nav: "nav";
                section: "section";
                td: "td";
            }>;
            role: z.ZodOptional<z.ZodEnum<{
                link: "link";
                status: "status";
                list: "list";
                main: "main";
                dialog: "dialog";
                button: "button";
                menu: "menu";
                checkbox: "checkbox";
                heading: "heading";
                listitem: "listitem";
                menuitem: "menuitem";
                navigation: "navigation";
                region: "region";
                switch: "switch";
                tab: "tab";
                tablist: "tablist";
                tabpanel: "tabpanel";
            }>>;
            expanded: z.ZodOptional<z.ZodBoolean>;
            pressed: z.ZodOptional<z.ZodEnum<{
                true: "true";
                false: "false";
                mixed: "mixed";
            }>>;
            selected: z.ZodOptional<z.ZodBoolean>;
            position: z.ZodEnum<{
                fixed: "fixed";
                static: "static";
                relative: "relative";
                absolute: "absolute";
                sticky: "sticky";
            }>;
            width: z.ZodNumber;
            height: z.ZodNumber;
            scrollLeft: z.ZodOptional<z.ZodNumber>;
            scrollTop: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
        resources: z.ZodOptional<z.ZodNumber>;
        errorsSinceMount: z.ZodOptional<z.ZodNumber>;
        status: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"captured">;
            jpegBase64: z.ZodString;
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"unavailable">;
            reason: z.ZodEnum<{
                unsupported: "unsupported";
                interrupted: "interrupted";
                "snapshot-limit": "snapshot-limit";
                "render-failed": "render-failed";
                "image-too-large": "image-too-large";
                "storage-unavailable": "storage-unavailable";
            }>;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type WebQaComment = z.infer<typeof WebQaComment>;
export declare const WebQaBatch: z.ZodObject<{
    batchId: z.ZodUUID;
    notes: z.ZodOptional<z.ZodString>;
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
        evidence: z.ZodOptional<z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            capturedAt: z.ZodISODateTime;
            input: z.ZodEnum<{
                page: "page";
                "left-click": "left-click";
                "right-click": "right-click";
                keyboard: "keyboard";
            }>;
            browser: z.ZodDiscriminatedUnion<[z.ZodObject<{
                family: z.ZodEnum<{
                    Unknown: "Unknown";
                    Chromium: "Chromium";
                    Chrome: "Chrome";
                    Edge: "Edge";
                    Firefox: "Firefox";
                    Safari: "Safari";
                    Opera: "Opera";
                    "Samsung Internet": "Samsung Internet";
                }>;
                versionSource: z.ZodLiteral<"user-agent">;
                version: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                family: z.ZodEnum<{
                    Unknown: "Unknown";
                    Chromium: "Chromium";
                    Chrome: "Chrome";
                    Edge: "Edge";
                    Firefox: "Firefox";
                    Safari: "Safari";
                    Opera: "Opera";
                    "Samsung Internet": "Samsung Internet";
                }>;
                versionSource: z.ZodLiteral<"unavailable">;
            }, z.core.$strict>], "versionSource">;
            os: z.ZodEnum<{
                iOS: "iOS";
                Unknown: "Unknown";
                Android: "Android";
                macOS: "macOS";
                Windows: "Windows";
                ChromeOS: "ChromeOS";
                Linux: "Linux";
            }>;
            dpr: z.ZodOptional<z.ZodNumber>;
            theme: z.ZodEnum<{
                dark: "dark";
                light: "light";
            }>;
            elements: z.ZodOptional<z.ZodArray<z.ZodObject<{
                tag: z.ZodEnum<{
                    main: "main";
                    a: "a";
                    summary: "summary";
                    other: "other";
                    body: "body";
                    label: "label";
                    dialog: "dialog";
                    span: "span";
                    header: "header";
                    footer: "footer";
                    button: "button";
                    article: "article";
                    form: "form";
                    img: "img";
                    table: "table";
                    div: "div";
                    p: "p";
                    ol: "ol";
                    li: "li";
                    h2: "h2";
                    ul: "ul";
                    aside: "aside";
                    details: "details";
                    h1: "h1";
                    h3: "h3";
                    nav: "nav";
                    section: "section";
                    td: "td";
                }>;
                role: z.ZodOptional<z.ZodEnum<{
                    link: "link";
                    status: "status";
                    list: "list";
                    main: "main";
                    dialog: "dialog";
                    button: "button";
                    menu: "menu";
                    checkbox: "checkbox";
                    heading: "heading";
                    listitem: "listitem";
                    menuitem: "menuitem";
                    navigation: "navigation";
                    region: "region";
                    switch: "switch";
                    tab: "tab";
                    tablist: "tablist";
                    tabpanel: "tabpanel";
                }>>;
                expanded: z.ZodOptional<z.ZodBoolean>;
                pressed: z.ZodOptional<z.ZodEnum<{
                    true: "true";
                    false: "false";
                    mixed: "mixed";
                }>>;
                selected: z.ZodOptional<z.ZodBoolean>;
                position: z.ZodEnum<{
                    fixed: "fixed";
                    static: "static";
                    relative: "relative";
                    absolute: "absolute";
                    sticky: "sticky";
                }>;
                width: z.ZodNumber;
                height: z.ZodNumber;
                scrollLeft: z.ZodOptional<z.ZodNumber>;
                scrollTop: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strict>>>;
            resources: z.ZodOptional<z.ZodNumber>;
            errorsSinceMount: z.ZodOptional<z.ZodNumber>;
            status: z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"captured">;
                jpegBase64: z.ZodString;
                width: z.ZodNumber;
                height: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"unavailable">;
                reason: z.ZodEnum<{
                    unsupported: "unsupported";
                    interrupted: "interrupted";
                    "snapshot-limit": "snapshot-limit";
                    "render-failed": "render-failed";
                    "image-too-large": "image-too-large";
                    "storage-unavailable": "storage-unavailable";
                }>;
            }, z.core.$strict>], "kind">;
        }, z.core.$strict>>;
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
        evidence?: {
            schemaVersion: 1;
            capturedAt: string;
            input: "page" | "left-click" | "right-click" | "keyboard";
            browser: {
                family: "Unknown" | "Chromium" | "Chrome" | "Edge" | "Firefox" | "Safari" | "Opera" | "Samsung Internet";
                versionSource: "user-agent";
                version: string;
            } | {
                family: "Unknown" | "Chromium" | "Chrome" | "Edge" | "Firefox" | "Safari" | "Opera" | "Samsung Internet";
                versionSource: "unavailable";
            };
            os: "iOS" | "Unknown" | "Android" | "macOS" | "Windows" | "ChromeOS" | "Linux";
            theme: "dark" | "light";
            status: {
                kind: "captured";
                jpegBase64: string;
                width: number;
                height: number;
            } | {
                kind: "unavailable";
                reason: "unsupported" | "interrupted" | "snapshot-limit" | "render-failed" | "image-too-large" | "storage-unavailable";
            };
            dpr?: number | undefined;
            elements?: {
                tag: "main" | "a" | "summary" | "other" | "body" | "label" | "dialog" | "span" | "header" | "footer" | "button" | "article" | "form" | "img" | "table" | "div" | "p" | "ol" | "li" | "h2" | "ul" | "aside" | "details" | "h1" | "h3" | "nav" | "section" | "td";
                position: "fixed" | "static" | "relative" | "absolute" | "sticky";
                width: number;
                height: number;
                role?: "link" | "status" | "list" | "main" | "dialog" | "button" | "menu" | "checkbox" | "heading" | "listitem" | "menuitem" | "navigation" | "region" | "switch" | "tab" | "tablist" | "tabpanel" | undefined;
                expanded?: boolean | undefined;
                pressed?: "true" | "false" | "mixed" | undefined;
                selected?: boolean | undefined;
                scrollLeft?: number | undefined;
                scrollTop?: number | undefined;
            }[] | undefined;
            resources?: number | undefined;
            errorsSinceMount?: number | undefined;
        } | undefined;
    }[];
    buildAndDeploy: boolean;
    makeFeatureFlag: boolean;
    notes?: string | undefined;
}>;
export declare function parseWebQaReceipt(value: unknown): z.ZodSafeParseResult<{
    batchId: string;
    factory: "queued" | "retry" | "not-requested";
}>;
