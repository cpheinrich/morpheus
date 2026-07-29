#!/usr/bin/env node
import { resolve } from "node:path";
import { claim, claims, create, index, validate } from "./pm.js";
import { pr } from "./check.js";

const HELP = `morpheus — an operating system for building and running companies

Usage
  morpheus pm validate [--dir <hq/product>]
  morpheus pm index    [--dir <hq/product>] [--check]
  morpheus pm new <roadmap|goals|requests> <title> [--priority P1] [--goal G-2026-Q3-01]
  morpheus pm claim <RM-014>
  morpheus pm claims
  morpheus check pr    [--dir <hq/product>] [--base origin/main]

Options
  --dir <path>   Product directory (default: hq/product)
  --base <ref>   Base ref for the PR diff (default: origin/main)
  --check        Verify indexes are current without writing; exits non-zero if stale
  -h, --help     Show this message
`;

interface Flags {
  dir: string;
  base: string;
  check: boolean;
  priority?: string;
  goal?: string;
  positional: string[];
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    dir: "hq/product",
    base: "origin/main",
    check: false,
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
