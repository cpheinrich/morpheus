interface AxNode {
    AXUniqueId?: string | null;
    AXLabel?: string | null;
    AXValue?: string | null;
    enabled?: boolean;
    role_description?: string;
    type?: string;
    frame?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    children?: AxNode[];
}
export interface QaAxSnapshot {
    screen: {
        width: number;
        height: number;
    };
    screenId: string | null;
    elements: Array<{
        id: string;
        path: string;
        frame: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        label: string;
        value: string;
        role: string;
        type: string;
        enabled: boolean;
    }>;
    errors?: string[];
}
/** Keep a fallback identity through a vertical drag, when lazy rows may be recycled. */
export declare class QaScreenIdentity {
    private stableId;
    private candidateId;
    private touchStart;
    private verticalScroll;
    noteTouch(type: "begin" | "move" | "end", x: number, y: number): void;
    observe(snapshot: QaAxSnapshot): QaAxSnapshot;
}
/** Use the app's screen identifier when SwiftUI exposes it in the raw AX tree. */
export declare function screenIdFromAxTree(roots: AxNode[]): string | null;
/** Preserve serve-sim's element paths while retaining the screen ID from that same native tree. */
export declare function qaAxSnapshotFromTree(roots: AxNode[]): QaAxSnapshot;
export declare function currentQaAxSnapshot(udid: string): Promise<QaAxSnapshot>;
/** Capture the image between matching native screen identities, so the saved PNG and ID agree. */
export declare function captureQaPlacement(udid: string, identify?: (snapshot: QaAxSnapshot) => QaAxSnapshot): Promise<{
    screenId: string;
    beforeSnapshot: QaAxSnapshot;
    snapshot: QaAxSnapshot;
    frame: {
        dataUrl: string;
        width: number;
        height: number;
        capturedAt: string;
    };
}>;
/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export declare function currentScreenId(udid: string): Promise<string | null>;
export {};
