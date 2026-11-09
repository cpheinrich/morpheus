declare function setJob(home: string, enabled: boolean): Promise<void>;
interface EnrollmentOptions {
    cwd?: string;
    binary?: string;
    setAgent?: typeof setJob;
}
export declare function runCodexHookEnrollment(command: string, { cwd, binary, setAgent }?: EnrollmentOptions): Promise<number>;
export {};
