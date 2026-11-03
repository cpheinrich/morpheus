import { z } from "zod";
/** Bumped by hand when tick semantics change; recorded in every status file. */
export declare const SCHEDULER_VERSION = "1.0.0";
export declare const SCHEDULES_PATH = ".morpheus/schedules.json";
/** Inputs the scheduler owns; a schedule may not set them itself. */
export declare const RESERVED_INPUTS: readonly ["scheduler-id", "scheduled-for"];
export declare const scheduleId: z.ZodString;
export declare function validTimezone(timezone: string): boolean;
declare const scheduleSchema: z.ZodObject<{
    id: z.ZodString;
    workflow: z.ZodString;
    cron: z.ZodString;
    timezone: z.ZodString;
    inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodBoolean, z.ZodNumber]>>>;
}, z.core.$strict>;
export declare const schedulesFileSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    schedules: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        workflow: z.ZodString;
        cron: z.ZodString;
        timezone: z.ZodString;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodBoolean, z.ZodNumber]>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const hostConfigSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    repositories: z.ZodArray<z.ZodString>;
    instanceId: z.ZodString;
    statusPath: z.ZodOptional<z.ZodString>;
    githubAccount: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type SchedulesFile = z.infer<typeof schedulesFileSchema>;
export type HostConfig = z.infer<typeof hostConfigSchema>;
export declare function formatIssues(error: z.ZodError): string;
export {};
