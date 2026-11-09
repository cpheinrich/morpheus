import { Cron } from "croner";
import { z } from "zod";
/** Bumped by hand when tick semantics change; recorded in every status file. */
export const SCHEDULER_VERSION = "1.0.0";
export const SCHEDULES_PATH = ".morpheus/schedules.json";
/** Inputs the scheduler owns; a schedule may not set them itself. */
export const RESERVED_INPUTS = ["scheduler-id", "scheduled-for"];
export const scheduleId = z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use lower-case words joined by single hyphens");
const workflowFile = z
    .string()
    .regex(/^[A-Za-z0-9._-]+\.ya?ml$/, "name a workflow file in .github/workflows, e.g. nightly.yml");
export function validTimezone(timezone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
    }
    catch {
        return false;
    }
}
const scheduleSchema = z
    .object({
    id: scheduleId,
    workflow: workflowFile,
    cron: z.string().min(1),
    timezone: z.string().min(1).refine(validTimezone, "unknown IANA timezone"),
    inputs: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
})
    .strict()
    .superRefine((schedule, ctx) => {
    try {
        // Five fields only: a seconds field would mint identities finer than the per-minute tick.
        new Cron(schedule.cron, { paused: true, mode: "5-part", timezone: schedule.timezone });
    }
    catch (error) {
        ctx.addIssue({ code: "custom", path: ["cron"], message: error.message });
    }
    for (const reserved of RESERVED_INPUTS) {
        if (schedule.inputs && reserved in schedule.inputs) {
            ctx.addIssue({ code: "custom", path: ["inputs", reserved], message: "is set by the scheduler" });
        }
    }
});
export const schedulesFileSchema = z
    .object({ schemaVersion: z.literal(1), schedules: z.array(scheduleSchema) })
    .strict()
    .superRefine((file, ctx) => {
    const seen = new Set();
    for (const [index, schedule] of file.schedules.entries()) {
        if (seen.has(schedule.id)) {
            ctx.addIssue({ code: "custom", path: ["schedules", index, "id"], message: `duplicate id ${schedule.id}` });
        }
        seen.add(schedule.id);
    }
});
export const hostConfigSchema = z
    .object({
    schemaVersion: z.literal(1),
    repositories: z.array(z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "use owner/repo")),
    instanceId: z.string().min(1).max(100),
    statusPath: z.string().min(1).optional(),
    githubAccount: z.string().min(1).optional(),
})
    .strict();
export function formatIssues(error) {
    return error.issues.map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
//# sourceMappingURL=schema.js.map