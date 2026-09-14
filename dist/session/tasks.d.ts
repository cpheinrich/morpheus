interface TaskBinding {
    root: string;
    task: string;
    pending?: boolean;
}
export declare function bindTask(cwd: string, task: string, sessionId?: string, pending?: boolean): Promise<void>;
export declare function boundTask(cwd: string, sessionId?: string): Promise<TaskBinding | null>;
/** Prepare only; the destination must be read/certified before claim can push. */
export declare function prepareTask(root: string, productDir: string, id: string): Promise<string | null>;
/** Resume by explicit roadmap identity, never by guessing which branch is meant. */
export declare function resumeTask(root: string, id: string, sessionId?: string): Promise<string>;
export {};
