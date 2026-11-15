import { dashboardMetadata, reportedPullRequests } from "./fleet-display.mjs";

const active = {
  TASK_STATE_SUBMITTED: "queued",
  TASK_STATE_WORKING: "running",
  TASK_STATE_INPUT_REQUIRED: "waiting",
  TASK_STATE_UNSPECIFIED: "unknown",
};
const recent = {
  TASK_STATE_COMPLETED: "succeeded",
  TASK_STATE_FAILED: "failed",
  TASK_STATE_CANCELED: "cancelled",
};
const limit = 16;
const fields = ["source.project", "source.revision", "display", "state", "createdAt",
  "attempt.leaseUntil", "attempt.hostId", "lastAttempt.hostId", "cancelRequestedAt", "result.pullRequests"];

function workRow(doc, { project, repository }, states, now) {
  const { id } = doc;
  const data = doc.data();
  const { createdAt, source, attempt, lastAttempt } = data;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || source?.project !== project ||
      !Object.hasOwn(states, data.state) || !Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > now) return [];
  const reported = states[data.state];
  const outcome = states === active ? liveReading(reported, data, now) : { state: reported };
  const host = (attempt ?? lastAttempt)?.hostId;
  const display = dashboardMetadata.safeParse(data.display).data ?? null;
  const pullRequests = reportedPullRequests.safeParse(data.result?.pullRequests).data ?? [];
  return [{ id, repository, ...outcome, createdAt, display,
    worker: typeof host === "string" && /^[\w-]{1,64}$/.test(host) ? host : null,
    revision: typeof source.revision === "string" && /^[a-f0-9]{40}$/.test(source.revision) ? source.revision : null,
    reportedPullRequests: pullRequests.filter(pr => pr.repository.toLowerCase() === repository.toLowerCase())
      .map(pr => pr.number),
  }];
}

function expiredContact(leaseUntil, now) {
  return Number.isSafeInteger(leaseUntil) && leaseUntil >= 0 && leaseUntil <= now
    ? new Date(leaseUntil).toISOString() : null;
}

function liveReading(reported, { attempt, cancelRequestedAt }, now) {
  const contactExpiredAt = expiredContact(attempt?.leaseUntil, now);
  const needsWorker = reported === "running" || reported === "waiting";
  const hasContact = Number.isSafeInteger(attempt?.leaseUntil) && attempt.leaseUntil > now;
  const uncertain = cancelRequestedAt != null || (needsWorker && !hasContact);
  return { state: uncertain ? "unknown" : reported, ...(contactExpiredAt && { contactExpiredAt }) };
}

/** The viewer binds one enrolled project and its GitHub repository; no requested scope. */
export async function readFleetWork(db, viewer, now) {
  const project = db.collection("factoryTasks").where("source.project", "==", viewer.project).select(...fields);
  const live = project.where("state", "in", Object.keys(active)).orderBy("createdAt", "desc").limit(limit + 1).get();
  // A failed history read must not hide current work.
  const finished = project.where("state", "in", Object.keys(recent)).orderBy("createdAt", "desc").limit(limit).get();
  const [liveResult, recentResult] = await Promise.allSettled([live, finished]);
  if (liveResult.status === "rejected") throw liveResult.reason;
  const docs = liveResult.value.docs;
  const rows = docs.slice(0, limit).flatMap(doc => workRow(doc, viewer, active, now));
  const tasks = new Map(rows.map(task => [task.id, task]));
  if (recentResult.status === "fulfilled") {
    // The reads can straddle a state change. The settled outcome supersedes live evidence.
    for (const task of recentResult.value.docs.flatMap(doc => workRow(doc, viewer, recent, now))) {
      tasks.set(task.id, task);
    }
  }
  return { status: docs.length > limit || recentResult.status === "rejected" ? "partial" : "available",
    observedAt: new Date(now).toISOString(), tasks: [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt) };
}
