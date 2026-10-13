export interface ServeOptions {
    /** Project checkout that receives local/qa-comments/ (e.g. Evo). */
    root: string;
    /** Upstream preview (serve-sim) origin, e.g. http://127.0.0.1:3200/ */
    previewUrl: string;
    /** Port for this overlay. 0 = ephemeral. */
    port: number;
    /** Value written into batch.project; defaults to morpheus.json name. */
    project?: string;
    /** Optional explicit MJPEG URL; otherwise discovered. */
    streamUrl?: string;
    /** Called once listening. */
    onListen?: (info: {
        url: string;
        port: number;
        streamUrl: string | null;
    }) => void;
}
/** Find serve-sim's MJPEG URL for a preview origin by reading its local state files. */
export declare function discoverStreamUrl(previewOrigin: string): Promise<string | null>;
/**
 * serve-sim's Indigo HID path takes x/y in 0..1 of the screen (see its preview
 * client and HIDInjector "normalized 0..1"). Framebuffer pixels (1206×2622)
 * land off the point-space screen and the simulator ignores the tap.
 */
export declare function hidTouchBody(type: "begin" | "move" | "end", normX: number, normY: number): {
    type: "begin" | "move" | "end";
    x: number;
    y: number;
};
/** USB HID usage page 0x07, same table as the serve-sim preview client (KeyboardEvent.code). */
export declare const HID_KEY_USAGE: Readonly<Record<string, number>>;
/** Opcode 6 payload: { type: "down"|"up", usage }. */
export declare function hidKeyBody(type: "down" | "up", code: string): {
    type: "down" | "up";
    usage: number;
} | null;
export declare function startQaCommentServer(options: ServeOptions): Promise<{
    url: string;
    port: number;
    close: () => Promise<void>;
    streamUrl: string | null;
}>;
