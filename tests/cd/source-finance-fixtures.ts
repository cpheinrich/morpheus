import { configurationDigest, hash, type CdState } from "../../src/cd/schema.js";
import { GitHubStore } from "../../src/cd/store.js";
import { config, now } from "./fixtures.js";
import { FakeGitHub } from "./fake-github.js";

export const sourceRequest = () => ({ version: 1, kind: "source-ci-publication", repository: "example/app", taskId: "EX-26-10-18-11.00.00", branch: "ex-source-review", fullCiMax: 3, metadataCiMax: 2, gitBranchPreviewsMax: 4, productionDeploymentsMax: 1, budgetTransactionsMax: 1, nativeEffects: false, paidModelFallback: false, previewSettingsEffects: false });
export async function financeFixture(maximumMicros = 17_000_000, totalCeilingMicros = 275_000_000, seed?: (state: CdState) => void) {
  const cfg = config(), api = new FakeGitHub(), store = new GitHubStore(api, cfg), request = sourceRequest();
  await store.initialize(now, "fixture-epoch");
  await store.transact("fixture-existing-liability", "fixture", now, state => { state.budget.spentMicros = 240_000_000; seed?.(state); return null; });
  const grant = { version: 1, kind: "reviewed-source-financial-authority", grantId: "fixture-reviewed-grant", humanEvidenceSha256: hash("fixture-human-record"), repository: cfg.repository, epoch: "fixture-epoch", configurationDigest: configurationDigest(cfg), reservationId: "source-ci-fixture-task", requestDigest: hash(request), maximumMicros, totalCeilingMicros, purpose: "source-ci-publication", issuedAt: now, expiresAt: "2026-10-18T18:10:00.000Z" };
  const input = { grant, approvedGrantDigest: hash(grant), request, reservationId: grant.reservationId, maximumMicros };
  api.calls.length = 0;
  return { cfg, api, store, request, grant, input };
}
export function repin(f: Awaited<ReturnType<typeof financeFixture>>): void { f.grant.requestDigest = hash(f.request); f.input.approvedGrantDigest = hash(f.grant); }
