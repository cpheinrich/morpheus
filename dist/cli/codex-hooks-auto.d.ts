declare function setJob(home: string, enabled: boolean): Promise<void>;
interface EnrollmentOptions {
    cwd?: string;
    checkout?: string | undefined;
    binary?: string;
    setAgent?: typeof setJob;
}
export declare function runCodexHookEnrollment(command: string, { cwd, checkout, binary, setAgent }?: EnrollmentOptions): Promise<number>;
export {};
