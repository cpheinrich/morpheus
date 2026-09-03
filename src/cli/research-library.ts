import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ResearchLibraryOptions {
  root: string; project?: string; bucket?: string; objectPrefix?: string;
  catalogDir?: string; localRoot?: string; gcloud?: string;
}
interface Manifest {
  researchLibrary?: {
    project: string; bucket: string; objectPrefix?: string; catalogDir?: string; localRoot?: string;
  };
  [key: string]: unknown;
}
const DEFAULT_OBJECT_PREFIX = "research-library/books";
const DEFAULT_CATALOG_DIR = "hq/research/library/catalog";
const DEFAULT_LOCAL_ROOT = "local/research-library";

async function readManifest(root: string): Promise<{ path: string; value: Manifest }> {
  const manifestPath = join(root, "morpheus.json");
  try {
    return { path: manifestPath, value: JSON.parse(await readFile(manifestPath, "utf8")) as Manifest };
  } catch (error) {
    throw new Error("Could not read morpheus.json: " +
      (error instanceof Error ? error.message : String(error)));
  }
}

export async function initResearchLibrary(options: ResearchLibraryOptions): Promise<number> {
  try {
    const manifest = await readManifest(options.root);
    const existing = manifest.value.researchLibrary;
    const project = options.project ?? existing?.project;
    const bucket = options.bucket ?? existing?.bucket;
    if (!project || !bucket) {
      throw new Error("Pass --project and --bucket the first time a research library is initialized.");
    }
    const next = {
      project, bucket,
      objectPrefix: options.objectPrefix ?? existing?.objectPrefix ?? DEFAULT_OBJECT_PREFIX,
      catalogDir: options.catalogDir ?? existing?.catalogDir ?? DEFAULT_CATALOG_DIR,
      localRoot: options.localRoot ?? existing?.localRoot ?? DEFAULT_LOCAL_ROOT,
    };
    if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
      throw new Error("researchLibrary already exists in morpheus.json with different values; edit it deliberately.");
    }
    if (!existing) {
      manifest.value.researchLibrary = next;
      await writeFile(manifest.path, JSON.stringify(manifest.value, null, 2) + "\n", "utf8");
      console.log("Added researchLibrary to morpheus.json.");
    }
    const catalog = resolve(options.root, next.catalogDir);
    await mkdir(catalog, { recursive: true });
    await writeIfAbsent(
      join(dirname(catalog), "README.md"),
      "# Research library\n\nCatalog manifests point to immutable, private bundle and HTML-reader objects. " +
      "Expanded books remain under the ignored local library and are never written by initialization.\n",
    );
    await writeIfAbsent(join(catalog, ".gitkeep"), "");
    await ensureIgnored(options.root, next.localRoot);
    console.log("Research library initialized; local source remains at " + next.localRoot + ".");
    return 0;
  } catch (error) {
    console.error("research library: " + (error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

export async function runResearchLibrary(
  command: string, args: string[], options: ResearchLibraryOptions,
): Promise<number> {
  try {
    const { value } = await readManifest(options.root);
    const config = value.researchLibrary;
    if (!config) throw new Error(
      "researchLibrary is absent from morpheus.json; run `morpheus research-library init`.",
    );
    const script = fileURLToPath(new URL("../research-library/library.py", import.meta.url));
    const forwarded = [...args];
    if (command === "push" || command === "pull") {
      forwarded.push("--local-root", resolve(options.root, config.localRoot ?? DEFAULT_LOCAL_ROOT));
    } else if (command === "fetch") {
      forwarded.push("--output-root", resolve(options.root, config.localRoot ?? DEFAULT_LOCAL_ROOT));
    }
    return await run(
      "python3",
      [script, ...(options.gcloud ? ["--gcloud", options.gcloud] : []), command, ...forwarded],
      {
      ...process.env,
      MORPHEUS_RESEARCH_LIBRARY_ROOT: options.root,
      MORPHEUS_RESEARCH_LIBRARY_PROJECT: config.project,
      MORPHEUS_RESEARCH_LIBRARY_BUCKET: config.bucket,
      MORPHEUS_RESEARCH_LIBRARY_OBJECT_PREFIX: config.objectPrefix ?? DEFAULT_OBJECT_PREFIX,
      MORPHEUS_RESEARCH_LIBRARY_CATALOG_DIR: config.catalogDir ?? DEFAULT_CATALOG_DIR,
      },
    );
  } catch (error) {
    console.error("research library: " + (error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(command + " terminated by " + signal));
      else resolvePromise(code ?? 1);
    });
  });
}
async function writeIfAbsent(path: string, content: string): Promise<void> {
  try { await readFile(path); } catch { await writeFile(path, content, { encoding: "utf8", flag: "wx" }); }
}
async function ensureIgnored(root: string, localRoot: string): Promise<void> {
  const ignorePath = join(root, ".gitignore");
  let value = "";
  try { value = await readFile(ignorePath, "utf8"); } catch { /* optional */ }
  const entry = "/" + localRoot.replace(/^\/+|\/+$/g, "") + "/";
  if (value.split(/\r?\n/).includes(entry)) return;
  const prefix = value.length > 0 && !value.endsWith("\n") ? "\n" : "";
  await writeFile(ignorePath, value + prefix + entry + "\n", "utf8");
}
