import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { fetchAppeekySnapshot, validateStudyDirectory } from "../product-research/server.js";

const USAGE = [
  "Usage:",
  "  morpheus product-research validate <study-directory>",
  "  morpheus product-research aso --app <id> --country us --device iphone --terms <a,b,c> [--branded-terms <x,y>] --out <path>",
].join("\n");

export async function validateProductResearch(directory: string | undefined): Promise<number> {
  if (!directory) {
    console.error(USAGE);
    return 1;
  }
  const { study, issues } = await validateStudyDirectory(directory);
  if (!study) {
    console.error(`${directory}: ${issues.length} problem${issues.length === 1 ? "" : "s"}`);
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
    return 1;
  }
  const assets = Object.values(study.assets);
  const bytes = assets.reduce((total, asset) => total + asset.bytes, 0);
  console.log(`${directory}: valid study ${study.studyId} — ${study.app.screens.length} screens, ` +
    `${study.app.transitions.length} transitions, ${assets.length} assets (${bytes} bytes)`);
  return 0;
}

/**
 * Fetch a compact Appeeky snapshot into `out`. The file is replaced only after the whole snapshot
 * succeeds and validates, so a failed or refused run leaves the previous snapshot in place.
 */
export async function asoProductResearch(
  args: string[],
  out: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<number> {
  let values: Record<string, string | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        app: { type: "string" }, country: { type: "string" }, device: { type: "string" },
        terms: { type: "string" }, "branded-terms": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 1;
  }
  const { app, country, device, terms } = values;
  if (!app || !country || !device || !terms || !out) {
    console.error(`--app, --country, --device, --terms and --out are required.\n\n${USAGE}`);
    return 1;
  }
  if (device !== "iphone" && device !== "ipad") {
    console.error("--device must be iphone or ipad.");
    return 1;
  }
  const apiKey = env.APPEEKY_API_KEY?.trim();
  if (!apiKey) {
    console.error("APPEEKY_API_KEY is not set; nothing was fetched.");
    return 1;
  }
  try {
    const snapshot = await fetchAppeekySnapshot({
      appId: app, country, device, terms: splitList(terms), brandedTerms: splitList(values["branded-terms"]),
    }, { apiKey, fetch: fetcher });
    const target = resolve(out);
    const temporary = `${target}.${process.pid}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    const ranked = snapshot.keywords.filter((keyword) => keyword.status === "ranked").length;
    console.log(`Wrote ${out}: ${snapshot.keywords.length} terms (${ranked} ranked) at ${snapshot.fetchedAt}.`);
    return 0;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\nThe previous snapshot, if any, is unchanged.`);
    return 1;
  }
}

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((term) => term.trim()).filter(Boolean);
}
