#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { claim, claims, create, index, ship, validate } from "./pm.js";
import { pr } from "./check.js";
import { validate as validateInbox } from "./inbox.js";
import { build as brandBuild, check as brandCheck, init as brandInit } from "./brand.js";
import { status as brandStatus } from "./brand-status.js";
import { sync as accessSync } from "./access.js";
import * as registry from "./registry.js";
import { run as doctorRun } from "./doctor.js";
import { mark as initMark, status as initStatus } from "./onboarding.js";
import { init as initScaffold } from "./init.js";
import { build as tokensBuild } from "./tokens.js";

const HELP = `morpheus — an operating system for building and running companies

Usage
  morpheus pm validate [--dir <hq/product>]
  morpheus pm index    [--dir <hq/product>] [--check]
  morpheus pm new <roadmap|goals|requests> <title> [--priority P1] [--goal G-2026-Q3-01]
  morpheus pm claim <RM-014>
  morpheus pm claims
  morpheus pm ship [<MO-020> ...]  [--check]
  morpheus check pr    [--dir <hq/product>] [--base origin/main]
  morpheus inbox validate   [--dir <hq/inbox>]
  morpheus brand init | refresh   [--dir <hq/brand>] [--name <Acme>] [--prefix <ac>]
  morpheus brand build            regenerate from an edited hq/brand/answers.md
  morpheus brand status           [--dir <hq/brand>] [--name <Acme>]
  morpheus brand check            [--dir <hq/brand>] — generated files vs answers.md
  morpheus access sync      [--project <firebase-project>] [--dry-run]
  morpheus registry list | add [--prefix XX] | remove <name>
  morpheus init             [--name <Acme>] [--prefix XX] [--kind company|personal|internal]
  morpheus init status      [--offline]
  morpheus init done | doing | todo <task-id>
  morpheus tokens build     [--source hq/brand/tokens.json] [--css <path>] [--ts <path>]
                            [--prefix brand] [--check]
  morpheus doctor           [--all]

Options
  --dir <path>   Product directory (default: hq/product)
  --base <ref>   Base ref for the PR diff (default: origin/main)
  --name <str>   Display name for brand init
  --prefix <str> Two-letter token prefix for brand init
  --check        Verify indexes are current without writing; exits non-zero if stale
  -h, --help     Show this message
`;

interface Flags {
  dir: string;
  base: string;
  name?: string;
  prefix?: string;
  check: boolean;
  project?: string;
  dryRun: boolean;
  all: boolean;
  offline: boolean;
  kind?: string;
  owner?: string;
  source?: string;
  css?: string;
  ts?: string;
  priority?: string;
  goal?: string;
  positional: string[];
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    dir: "hq/product",
    base: "origin/main",
    check: false,
    dryRun: false,
    all: false,
    offline: false,
    positional: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--dir":
        flags.dir = argv[++i] ?? flags.dir;
        break;
      case "--base":
        flags.base = argv[++i] ?? flags.base;
        break;
      case "--check":
        flags.check = true;
        break;
      case "--all":
        flags.all = true;
        break;
      case "--offline":
        flags.offline = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--project":
        flags.project = argv[++i];
        break;
      case "--name":
        flags.name = argv[++i];
        break;
      case "--prefix":
        flags.prefix = argv[++i];
        break;
      case "--kind":
        flags.kind = argv[++i];
        break;
      case "--source":
        flags.source = argv[++i];
        break;
      case "--css":
        flags.css = argv[++i];
        break;
      case "--ts":
        flags.ts = argv[++i];
        break;
      case "--owner":
        flags.owner = argv[++i];
        break;
      case "--priority":
        flags.priority = argv[++i];
        break;
      case "--goal":
        flags.goal = argv[++i];
        break;
      default:
        flags.positional.push(arg);
    }
  }
  return flags;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return 0;
  }

  const flags = parseArgs(argv);
  const [group, command, ...rest] = flags.positional;
  const dir = resolve(process.cwd(), flags.dir);

  if (group === "doctor") return doctorRun(process.cwd(), flags.all);

  if (group === "tokens") {
    if (command === "build" || command === undefined) {
      return tokensBuild({
        root: process.cwd(),
        source: flags.source,
        css: flags.css,
        ts: flags.ts,
        prefix: flags.prefix,
        check: flags.check,
      });
    }
    console.error(`Unknown tokens command "${command}".\n\n${HELP}`);
    return 1;
  }

  if (group === "init") {
    if (command === "status") {
      return initStatus(process.cwd(), flags.name, flags.offline);
    }
    if (command === undefined) {
      return initScaffold({
        root: process.cwd(),
        name: flags.name,
        prefix: flags.prefix,
        kind: flags.kind,
        owner: flags.owner,
      });
    }
    const states = { done: "done", doing: "in-progress", todo: "todo" } as const;
    const state = states[command as keyof typeof states];
    if (state) {
      if (!rest[0]) {
        console.error(`Which task? \`morpheus init status\` lists them.`);
        return 1;
      }
      return initMark(process.cwd(), rest[0], state, flags.name);
    }
    console.error(`Unknown init command "${command}".\n\n${HELP}`);
    return 1;
  }

  if (group === "registry") {
    if (command === "list") return registry.list();
    if (command === "add") return registry.add(process.cwd(), flags.prefix);
    if (command === "remove") return registry.remove(rest[0] ?? "");
    console.error(`Unknown registry command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  }

  if (group === "access") {
    if (command === "sync") return accessSync(process.cwd(), flags.project, flags.dryRun);
    console.error(`Unknown access command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  }

  if (group === "brand") {
    const brandDir = resolve(process.cwd(), flags.dir === "hq/product" ? "hq/brand" : flags.dir);
    const brandName = flags.name ?? basename(process.cwd());
    if (command === "status") {
      return brandStatus(brandDir, brandName);
    }
    if (command === "build") {
      return brandBuild({
        brandDir,
        name: brandName,
        prefix: flags.prefix ?? brandName.slice(0, 2).toLowerCase(),
      });
    }
    if (command === "check") {
      return brandCheck({
        brandDir,
        name: brandName,
        prefix: flags.prefix ?? brandName.slice(0, 2).toLowerCase(),
      });
    }
    if (command === "init" || command === "refresh") {
      return brandInit({
        brandDir,
        name: brandName,
        prefix: flags.prefix ?? brandName.slice(0, 2).toLowerCase(),
        refresh: command === "refresh",
      });
    }
    console.error(`Unknown brand command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  }

  if (group === "inbox") {
    if (command === "validate") {
      return validateInbox(resolve(process.cwd(), flags.dir === "hq/product" ? "hq/inbox" : flags.dir));
    }
    console.error(`Unknown inbox command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  }

  if (group === "check") {
    if (command === "pr") return pr(dir, flags.base);
    console.error(`Unknown check command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  }

  if (group !== "pm") {
    console.error(`Unknown command "${group ?? ""}".\n\n${HELP}`);
    return 1;
  }

  switch (command) {
    case "validate":
      return validate(dir);
    case "index":
      return index(dir, flags.check);
    case "claim":
      return claim(dir, rest[0] ?? "", process.cwd());
    case "claims":
      return claims(process.cwd());
    case "ship":
      return ship(dir, rest, process.cwd(), flags.check);
    case "new": {
      const [kind, ...titleParts] = rest;
      return create(dir, kind ?? "", titleParts.join(" "), {
        priority: flags.priority,
        goal: flags.goal,
      });
    }
    default:
      console.error(`Unknown pm command "${command ?? ""}".\n\n${HELP}`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
