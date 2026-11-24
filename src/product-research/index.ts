import { z } from "zod";

/**
 * The browser-safe contract for a host app research study and its App Store signals. Parsing is
 * strict about everything the viewer or the importer acts on — paths, hashes, ids and the
 * references between them — and keeps unknown study keys as data, so a newer capture tool can add
 * fields without a lockstep release here.
 */

/** iPhone point canvas used when an element's bounds are in points (the default space). */
export const APP_RESEARCH_POINT_CANVAS = { width: 393, height: 852 } as const;
export const STUDY_FILE = "study.json";

type ValidationIssue = { path: string; message: string };

export class ProductResearchValidationError extends Error {
  constructor(readonly kind: "study" | "snapshot", readonly issues: ValidationIssue[]) {
    const shown = issues.slice(0, 8).map((issue) => `  ${issue.path || "(root)"}: ${issue.message}`);
    const more = issues.length > shown.length ? [`  …and ${issues.length - shown.length} more`] : [];
    super([`Invalid ${kind === "study" ? "app research study" : "Appeeky snapshot"}:`, ...shown, ...more].join("\n"));
    this.name = "ProductResearchValidationError";
  }
}

/**
 * A relative path inside the study directory: plain segments only, so no absolute path, parent
 * traversal, backslash, query or fragment can reach storage or the filesystem.
 */
export function isSafeAssetPath(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false;
  return value.split("/").every((segment) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) && segment !== "." && segment !== "..");
}

const text = z.string().trim().min(1);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, "ids are 1–128 letters, digits, '.', '_', ':' or '-'");
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase hex SHA-256");
const timestamp = z.iso.datetime({ offset: true });
const assetPath = z.string().refine(isSafeAssetPath, "expected a safe relative path");
const dimension = z.number().int().positive();

const boundsSchema = z.object({
  x: z.number().finite(), y: z.number().finite(),
  width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(),
});

const elementSchema = z.looseObject({
  id, label: z.string(), role: z.string(), behavior: z.string(), status: z.string(),
  bounds: boundsSchema.nullable(),
  boundsSpace: z.enum(["points", "pixels", "normalized"]).optional(),
  evidence: z.union([z.string(), z.array(z.string())]).optional(),
  screenshotPath: assetPath.optional(),
});

const screenshotSchema = z.looseObject({
  path: assetPath,
  accessibility: assetPath.optional(),
  capturedAt: timestamp,
  position: z.unknown().optional(),
  sha256,
  width: dimension,
  height: dimension,
  layoutRegions: z.array(z.unknown()).optional(),
});

const screenSchema = z.looseObject({
  id, title: text, state: z.string(), description: z.string(),
  elements: z.array(elementSchema),
  // A protected or text-only observation has no capture; null and [] mean the same thing.
  screenshots: z.array(screenshotSchema).nullable().transform((shots) => shots ?? []),
});

const flowSchema = z.looseObject({
  id, title: text, entryScreenId: id,
  parentFlowId: id.optional(),
  screenIds: z.array(id).optional(),
});

const transitionSchema = z.looseObject({
  id, actionId: z.string(),
  from: id.nullable(), to: id.nullable(), elementId: id.nullable(),
  action: z.string(), result: z.string(), status: z.string(),
  beforeScreenshot: assetPath.nullable().optional(),
  afterScreenshot: assetPath.nullable().optional(),
  precondition: z.string().optional(),
  sideEffects: z.union([z.string(), z.array(z.string())]).optional(),
});

const assetSchema = z.object({ bytes: z.number().int().nonnegative(), sha256, contentType: text });

const studySchema = z.looseObject({
  schemaVersion: z.literal(1),
  studyId: id,
  capturedAt: timestamp,
  device: z.looseObject({ model: text, osVersion: text.optional() }),
  app: z.looseObject({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a lowercase slug"),
    name: text, version: z.string(), status: z.string(), summary: z.string(),
    entryScreenId: id,
    screens: z.array(screenSchema).min(1),
    flows: z.array(flowSchema).optional(),
    transitions: z.array(transitionSchema),
    gaps: z.array(z.unknown()),
    replayChecks: z.array(z.unknown()),
    metrics: z.record(z.string(), z.unknown()),
  }),
  assets: z.record(assetPath, assetSchema),
  downloads: z.array(z.object({ label: text, path: assetPath })),
});

export type AppResearchStudy = z.output<typeof studySchema>;
export type AppResearchScreen = AppResearchStudy["app"]["screens"][number];
export type AppResearchFlow = z.output<typeof flowSchema>;
export type AppResearchElement = AppResearchScreen["elements"][number];
export type AppResearchScreenshot = AppResearchScreen["screenshots"][number];
export type AppResearchTransition = AppResearchStudy["app"]["transitions"][number];
export type AppResearchAsset = AppResearchStudy["assets"][string];

export function parseAppResearchStudy(input: unknown): AppResearchStudy {
  const parsed = studySchema.safeParse(input);
  if (!parsed.success) throw new ProductResearchValidationError("study", zodIssues(parsed.error));
  const issues = studyReferenceIssues(parsed.data);
  if (issues.length) throw new ProductResearchValidationError("study", issues);
  return parsed.data;
}

/** Every id is unique and every reference — screen, element, asset, hash — resolves. */
function studyReferenceIssues(study: AppResearchStudy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { app, assets } = study;
  const asset = (path: string, at: string) => {
    if (path === STUDY_FILE) issues.push({ path: at, message: `${STUDY_FILE} is not an asset` });
    else if (!Object.hasOwn(assets, path)) issues.push({ path: at, message: `"${path}" is not in assets` });
  };
  if (Object.hasOwn(assets, STUDY_FILE)) issues.push({ path: `assets.${STUDY_FILE}`, message: `${STUDY_FILE} is not an asset` });

  const screens = new Set<string>();
  const elements = new Set<string>();
  app.screens.forEach((screen, s) => {
    const at = `app.screens.${s}`;
    if (screens.has(screen.id)) issues.push({ path: `${at}.id`, message: `duplicate screen id "${screen.id}"` });
    screens.add(screen.id);
    const shots = new Set<string>();
    screen.screenshots.forEach((shot, i) => {
      asset(shot.path, `${at}.screenshots.${i}.path`);
      if (shot.accessibility) asset(shot.accessibility, `${at}.screenshots.${i}.accessibility`);
      const recorded = Object.hasOwn(assets, shot.path) ? assets[shot.path] : undefined;
      if (recorded && recorded.sha256 !== shot.sha256) {
        issues.push({ path: `${at}.screenshots.${i}.sha256`, message: "does not match the asset inventory" });
      }
      shots.add(shot.path);
    });
    screen.elements.forEach((element, e) => {
      if (elements.has(element.id)) issues.push({ path: `${at}.elements.${e}.id`, message: `duplicate element id "${element.id}"` });
      elements.add(element.id);
      if (element.screenshotPath && !shots.has(element.screenshotPath)) {
        issues.push({ path: `${at}.elements.${e}.screenshotPath`, message: "is not one of this screen's screenshots" });
      }
    });
  });
  if (!screens.has(app.entryScreenId)) issues.push({ path: "app.entryScreenId", message: `unknown screen "${app.entryScreenId}"` });
  checkFlowReferences(app.flows ?? [], screens, issues);

  const transitions = new Set<string>();
  app.transitions.forEach((transition, t) => {
    const at = `app.transitions.${t}`;
    if (transitions.has(transition.id)) issues.push({ path: `${at}.id`, message: `duplicate transition id "${transition.id}"` });
    transitions.add(transition.id);
    for (const key of ["from", "to"] as const) {
      const target = transition[key];
      if (target !== null && !screens.has(target)) issues.push({ path: `${at}.${key}`, message: `unknown screen "${target}"` });
    }
    if (transition.elementId !== null && !elements.has(transition.elementId)) {
      issues.push({ path: `${at}.elementId`, message: `unknown element "${transition.elementId}"` });
    }
    if (transition.beforeScreenshot) asset(transition.beforeScreenshot, `${at}.beforeScreenshot`);
    if (transition.afterScreenshot) asset(transition.afterScreenshot, `${at}.afterScreenshot`);
  });
  study.downloads.forEach((download, d) => asset(download.path, `downloads.${d}.path`));
  return issues;
}

function checkFlowReferences(flows: AppResearchFlow[], screens: ReadonlySet<string>, issues: ValidationIssue[]): void {
  const flowIndexes = new Map<string, number>();
  flows.forEach((flow, index) => {
    if (flowIndexes.has(flow.id)) issues.push({ path: `app.flows.${index}.id`, message: `duplicate flow id "${flow.id}"` });
    else flowIndexes.set(flow.id, index);
  });
  flows.forEach((flow, index) => {
    const at = `app.flows.${index}`;
    if (!screens.has(flow.entryScreenId)) {
      issues.push({ path: `${at}.entryScreenId`, message: `unknown screen "${flow.entryScreenId}"` });
    }
    if (flow.parentFlowId !== undefined && !flowIndexes.has(flow.parentFlowId)) {
      issues.push({ path: `${at}.parentFlowId`, message: `unknown flow "${flow.parentFlowId}"` });
    }
    const members = new Set<string>();
    flow.screenIds?.forEach((screenId, memberIndex) => {
      const memberAt = `${at}.screenIds.${memberIndex}`;
      if (members.has(screenId)) issues.push({ path: memberAt, message: `duplicate screen id "${screenId}"` });
      if (!screens.has(screenId)) issues.push({ path: memberAt, message: `unknown screen "${screenId}"` });
      members.add(screenId);
    });
  });
  checkFlowParentCycles(flows, flowIndexes, issues);
}

function checkFlowParentCycles(
  flows: AppResearchFlow[], flowIndexes: ReadonlyMap<string, number>, issues: ValidationIssue[],
): void {
  const traversalRoots = new Map<string, string>();
  for (const root of flowIndexes.keys()) {
    let flowId: string | undefined = root;
    while (flowId !== undefined && !traversalRoots.has(flowId)) {
      const index = flowIndexes.get(flowId);
      if (index === undefined) break;
      traversalRoots.set(flowId, root);
      const parentId = flows[index]!.parentFlowId;
      if (parentId !== undefined && traversalRoots.get(parentId) === root) {
        issues.push({ path: `app.flows.${index}.parentFlowId`, message: `flow parent cycle through "${parentId}"` });
        break;
      }
      flowId = parentId;
    }
  }
}

const optionalText = z.string().optional();
const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("appeeky"),
  appId: text,
  country: z.string().regex(/^[a-z]{2}$/, "expected a lowercase ISO country code"),
  device: z.enum(["iphone", "ipad"]),
  fetchedAt: timestamp,
  listing: z.object({
    title: optionalText, category: optionalText, version: optionalText, releasedAt: optionalText,
    rating: z.number().min(0).max(5).optional(),
    ratingCount: z.number().int().nonnegative().optional(),
    downloadPrice: z.number().nonnegative().optional(),
    currency: optionalText,
    appStoreUrl: z.url({ protocol: /^https$/ }).optional(),
  }),
  keywords: z.array(z.object({
    term: text,
    branded: z.boolean(),
    // null with status "unranked" means verified outside the results; "missing" means not verified.
    rank: z.number().int().positive().nullable(),
    rankChange7d: z.number().optional(),
    volumeScore: z.number().optional(),
    difficulty: z.number().optional(),
    status: z.enum(["ranked", "unranked", "missing"]).optional(),
  })),
});

export type AppeekySnapshot = z.output<typeof snapshotSchema>;
export type AppeekyKeyword = AppeekySnapshot["keywords"][number];

export function parseAppeekySnapshot(input: unknown): AppeekySnapshot {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new ProductResearchValidationError("snapshot", zodIssues(parsed.error));
  return parsed.data;
}

function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}
