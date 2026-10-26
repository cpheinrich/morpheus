import { type Hash, type LedgerStore } from "./repair-control.js";
export interface ControlDeps {
    store: LedgerStore;
    hash: Hash;
    now: () => string;
    out: (line: string) => void;
}
export declare function runRepairControl(argv: string[], d: ControlDeps): Promise<number>;
