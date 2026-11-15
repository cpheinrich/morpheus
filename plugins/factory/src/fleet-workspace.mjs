import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

export const workspaceId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const sourceRevision = z.string().regex(/^[0-9a-f]{40}$/);
const credential = z.strictObject({ reference: workspaceId, revision: sourceRevision, manifestSha256: z.string().regex(/^[0-9a-f]{64}$/) });
export const workspacePolicy = z.strictObject({
  id: workspaceId,
  primary: workspaceId,
  profile: workspaceId,
  sandbox: z.enum(["workspace-write", "danger-full-access"]),
  repositories: z.array(z.strictObject({
    project: workspaceId,
    comparisonRef: z.string().regex(/^refs\/remotes\/origin\/[A-Za-z0-9][A-Za-z0-9_-]*$/).refine(ref => !ref.endsWith("/HEAD")),
    comparisonRevision: sourceRevision,
    credential: credential.optional(),
  })).min(1).max(16),
}).refine(p => new Set(p.repositories.map(r => r.project)).size === p.repositories.length &&
  p.repositories.some(r => r.project === p.primary));
export const workspaceIntent = z.strictObject({ id: workspaceId, revisions: z.record(workspaceId, sourceRevision) });
export const digest = value => createHash("sha256").update(value).digest("hex");

export function normalizePolicy(value) {
  const policy = workspacePolicy.parse(value);
  return { ...policy, repositories: policy.repositories.sort((a, b) => a.project < b.project ? -1 : a.project > b.project ? 1 : 0) };
}

export function bindWorkspace(value, intent) {
  const policy = normalizePolicy(value);
  const requested = workspaceIntent.parse(intent);
  const projects = policy.repositories.map(r => r.project);
  if (requested.id !== policy.id || !isDeepStrictEqual(Object.keys(requested.revisions).sort(), [...projects].sort()))
    throw new Error("Workspace repository set is outside enrollment");
  return { ...policy, policyDigest: digest(JSON.stringify(policy)), repositories: policy.repositories.map(repo =>
    ({ ...repo, revision: requested.revisions[repo.project] })) };
}

export function verifyWorkspace(policy, binding) {
  const expected = bindWorkspace(policy, { id: binding?.id,
    revisions: Object.fromEntries((binding?.repositories ?? []).map(r => [r.project, r.revision])) });
  if (!isDeepStrictEqual(binding, expected)) throw new Error("Workspace binding differs from enrollment");
  return expected;
}

// Shared by authenticated service submission and synthetic qualification. All
// authority comes from enrollment; intent supplies only exact commit identities.
export function workspaceLaunch(config, principal, input, project) {
  const policy = config.workspaces?.[input.workspace?.id];
  if (!policy || project.workspace !== input.workspace?.id) throw new Error("Workspace is not enrolled");
  const workspace = bindWorkspace(policy, input.workspace);
  if (workspace.primary !== input.project || workspace.repositories.find(r => r.project === input.project)?.revision !== input.revision ||
      workspace.repositories.some(r => {
        const enrolled = config.projects[r.project];
        return !principal.projects.includes(r.project) || !enrolled || enrolled.revision !== "git" ||
          enrolled.workspace !== workspace.id || enrolled.workspaceKey !== project.workspaceKey ||
          !isDeepStrictEqual(enrolled.selection, project.selection) || project.eligibleSlots.some(s => !enrolled.eligibleSlots.includes(s));
      }))
    throw new Error("Workspace projects are outside controller enrollment");
  return workspace;
}
