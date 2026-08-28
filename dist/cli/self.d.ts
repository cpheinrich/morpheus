export declare function check(offline: boolean): Promise<number>;
export declare function install(source: string): Promise<number>;
export declare function update(): Promise<number>;
/** Called by managed Git hooks. Current is deliberately silent. */
export declare function ensure(): Promise<number>;
export declare function autoUpdate(action: string | undefined, root: string): Promise<number>;
