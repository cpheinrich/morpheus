/**
 * The production web QA panel's state, without DOM rendering: what one pin records, how drafts
 * survive navigation and reload, and how Send stays safe to retry. `mount.ts` draws it.
 *
 * Retry safety. Send freezes the batch (UUID, comments and options) into `pending` and writes it
 * to sessionStorage *before* calling the host, so a lost response, a reload mid-request or a
 * "saved, but the build request did not queue" receipt all resend exactly the same batch. The host
 * server treats a repeated `batchId` as the same batch.
 */
import { z } from "zod";
import { WebQaBatch } from "./schema.js";
declare const WebQaDraft: z.ZodObject<{
    id: z.ZodString;
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
    pageX: z.ZodNumber;
    pageY: z.ZodNumber;
    anchorX: z.ZodOptional<z.ZodNumber>;
    anchorY: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type WebQaDraft = z.infer<typeof WebQaDraft>;
declare const WebQaSession: z.ZodObject<{
    version: z.ZodLiteral<1>;
    drafts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
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
        pageX: z.ZodNumber;
        pageY: z.ZodNumber;
        anchorX: z.ZodOptional<z.ZodNumber>;
        anchorY: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    notes: z.ZodOptional<z.ZodString>;
    buildAndDeploy: z.ZodBoolean;
    makeFeatureFlag: z.ZodBoolean;
    pending: z.ZodNullable<z.ZodObject<{
        batch: z.ZodObject<{
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
        drafts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
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
            pageX: z.ZodNumber;
            pageY: z.ZodNumber;
            anchorX: z.ZodOptional<z.ZodNumber>;
            anchorY: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        state: z.ZodEnum<{
            unconfirmed: "unconfirmed";
            rejected: "rejected";
            "build-retry": "build-retry";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WebQaSession = z.infer<typeof WebQaSession>;
export declare function emptySession(): WebQaSession;
/** One tab's drafts per project, signed-in account and site origin. */
export declare function sessionKey(project: string, accountKey: string, origin: string): string;
/** A stored session, or a fresh one when storage is unavailable or holds something else. */
export declare function loadSession(storage: Pick<Storage, "getItem"> | null, key: string): WebQaSession;
/** False when the browser refused the write (quota, private mode); the caller warns. */
export declare function saveSession(storage: Pick<Storage, "setItem"> | null, key: string, session: WebQaSession): boolean;
/** Why a pin may not be placed on this element, or null when it may. */
export declare function blockedReason(el: Element): string | null;
/** The nearest explicit `data-qa-anchor` token, when it is a valid one. */
export declare function anchorFor(el: Element): {
    token: string;
    el: Element;
} | null;
/** Drafts and the pending batch together stay within one batch, so reopening a batch never overflows. */
export declare function canPin(session: WebQaSession): boolean;
type PinWindow = Pick<Window, "innerWidth" | "innerHeight" | "scrollX" | "scrollY"> & {
    location: Pick<Location, "pathname">;
};
/**
 * A new draft for a click on `target`, or the reason none is allowed. Reads only the pathname,
 * the viewport, the click point and an explicit anchor token — never text, values or markup.
 */
export declare function pinAt(win: PinWindow, target: Element, clientX: number, clientY: number, id: string): {
    draft: WebQaDraft;
} | {
    error: string;
};
/** Viewport point for a draft's marker on the current page, or null when it belongs elsewhere or is off screen. */
export declare function markerPoint(draft: WebQaDraft, win: PinWindow, doc: Pick<Document, "querySelector">): {
    x: number;
    y: number;
} | null;
/**
 * Freeze the drafts that have text into a pending batch. Returns the existing pending batch
 * untouched when one is waiting, so a retry can never mint a second UUID for the same comments.
 */
export declare function freeze(session: WebQaSession, batchId: string, canBuild: boolean): {
    session: WebQaSession;
    batch: WebQaBatch;
} | {
    error: string;
};
export type SendOutcome = "saved" | "queued" | "build-retry" | "unconfirmed";
/** Apply the host's answer (a receipt, or `undefined` when submit threw) to the pending batch. */
export declare function settle(session: WebQaSession, receipt: unknown): {
    session: WebQaSession;
    outcome: SendOutcome;
};
/** A first attempt explicitly rejected by the server may be corrected under a new batch ID. */
export declare function reopenPending(session: WebQaSession): WebQaSession;
/** Drop a build request that keeps failing; the comments themselves were already saved. */
export declare function skipBuild(session: WebQaSession): WebQaSession;
export declare function outcomeMessage(outcome: SendOutcome, count: number): string;
export {};
