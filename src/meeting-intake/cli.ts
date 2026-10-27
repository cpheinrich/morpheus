import { readFile, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildCatalog, completionNotice, renderIndex, searchCatalog, type Catalog } from "./core.js";
import { readCanonicalRecords } from "./git.js";
import { meetingIntakeGuide } from "./guide.js";
import { parseMeetingIntakeConfig, type MeetingIntakeConfig } from "./schema.js";

async function loadConfig(root: string, path: string): Promise<MeetingIntakeConfig> {
  const absolute = isAbsolute(path) ? path : join(root, path);
  return parseMeetingIntakeConfig(JSON.parse(await readFile(absolute, "utf8")));
}

async function catalogForSearch(
  root: string,
  config: MeetingIntakeConfig,
  source: string | undefined,
  revision: string,
): Promise<Catalog> {
  if (config.projection) {
    return JSON.parse(
      await readFile(join(root, config.projection.directory, "catalog.json"), "utf8"),
    ) as Catalog;
  }
  const canonical = source ? resolve(source) : root;
  const records = await readCanonicalRecords(canonical, revision, config);
  return buildCatalog(records.records, records.revision, config);
}

export async function runMeetingIntake(argv: string[], root = process.cwd()): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      config: { type: "string", default: ".morpheus/meeting-intake.json" },
      source: { type: "string" },
      revision: { type: "string", default: "HEAD" },
      check: { type: "boolean", default: false },
      query: { type: "string", default: "" },
      topic: { type: "string" },
      limit: { type: "string", default: "5" },
      state: { type: "string" },
      meeting: { type: "string" },
    },
  });
  const command = positionals[0];
  if (command === "guide") {
    console.log(meetingIntakeGuide());
    return 0;
  }
  const config = await loadConfig(root, values.config);
  if (command === "index") {
    if (!config.projection) throw new Error("This profile has no catalog projection");
    if (!values.source || !isAbsolute(values.source)) {
      throw new Error("Use an absolute --source path to the canonical repository");
    }
    const { revision, records } = await readCanonicalRecords(
      values.source,
      values.revision,
      config,
    );
    const catalog = buildCatalog(records, revision, config);
    if (catalog.entries.length === 0) {
      throw new Error("No records match the configured project; refusing empty projection");
    }
    const destination = join(root, config.projection.directory);
    if (!values.check) await mkdir(destination, { recursive: true });
    const outputs: Array<[string, string]> = [
      ["catalog.json", `${JSON.stringify(catalog, null, 2)}\n`],
      ["README.md", renderIndex(catalog, config)],
    ];
    for (const [name, content] of outputs) {
      const path = join(destination, name);
      if (values.check) {
        if ((await readFile(path, "utf8")) !== content) {
          throw new Error(`${name} is stale; regenerate from the intended canonical revision`);
        }
      } else {
        await writeFile(path, content);
      }
    }
    console.log(`${values.check ? "Verified" : "Generated"} ${catalog.entries.length} entries from ${revision}`);
    return 0;
  }
  if (command === "search") {
    const catalog = await catalogForSearch(root, config, values.source, values.revision);
    console.log(
      JSON.stringify(
        {
          source: catalog.source,
          matches: searchCatalog(catalog, values.query, values.topic, Number(values.limit)),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (command === "notification") {
    if (!values.state || !values.meeting) {
      throw new Error("Use --state and --meeting; this formats but never sends");
    }
    const state = JSON.parse(await readFile(resolve(values.state), "utf8")) as {
      meetings?: Record<string, Record<string, unknown>>;
    };
    const record = state.meetings?.[values.meeting];
    if (!record) throw new Error("Meeting not found in journal");
    console.log(completionNotice(record, config));
    return 0;
  }
  throw new Error("Use guide, index, search or notification");
}
