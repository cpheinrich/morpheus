import { z } from "zod";

const displayText = (limit) => z.string().trim().min(1).max(limit).refine(text => !/[\p{Cc}\p{Cf}]/u.test(text));
const number = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const githubRepository = /^(?!\.{1,2}\/)[-\w.]+\/(?!\.{1,2}$)[-\w.]+$/;

export const dashboardMetadata = z.strictObject({
  title: displayText(80),
  summary: displayText(320),
  pullRequests: z.array(number).max(3).refine(prs => new Set(prs).size === prs.length).optional(),
}).describe("Optional HQ Work display: a short task title and one-sentence summary safe for this project's authorized dashboard viewers. Include same-repository PR numbers when already known. Never copy the private prompt or include secrets, private logs, or task IDs.");

export const reportedPullRequests = z.array(z.strictObject({
  repository: z.string().max(150).regex(githubRepository),
  number,
})).max(3);

// Workers already return plain evidence strings. Keep only exact GitHub PR
// references, never the surrounding text. The desk checks repository scope.
export function pullRequestsInEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  const links = new Map();
  for (const entry of evidence.slice(0, 20)) {
    if (typeof entry !== "string") continue;
    for (const match of entry.slice(0, 2000).matchAll(/(?:^|[\s(<\[])https:\/\/github\.com\/([-\w.]+\/[-\w.]+)\/pull\/([1-9]\d*)(?=$|[\s>)\]])/g)) {
      const [, repo, number] = match;
      if (githubRepository.test(repo) && Number.isSafeInteger(Number(number))) {
        links.set(`${repo.toLowerCase()}#${number}`, { repository: repo.toLowerCase(), number: Number(number) });
        if (links.size === 3) return [...links.values()];
      }
    }
  }
  return [...links.values()];
}
