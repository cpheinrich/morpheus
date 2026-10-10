interface AxNode {
    AXUniqueId?: string | null;
    frame?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    children?: AxNode[];
}
/** Use the app's screen identifier when SwiftUI exposes it in the raw AX tree. */
export declare function screenIdFromAxTree(roots: AxNode[]): string | null;
/** The pinned serve-sim package ships the same native AX bridge used by its preview. */
export declare function currentScreenId(udid: string): Promise<string | null>;
export {};
