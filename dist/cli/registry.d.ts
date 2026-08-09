export declare function list(): Promise<number>;
/** Register the project in cwd, deriving what it can from morpheus.json. */
export declare function add(cwd: string, prefixArg?: string): Promise<number>;
export declare function remove(name: string): Promise<number>;
