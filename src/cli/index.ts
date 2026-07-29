#!/usr/bin/env node
import { resolve } from "node:path";
import { create, index, validate } from "./pm.js";

const HELP = `morpheus — an operating system for building and running companies

Usage
  morpheus pm validate [--dir <hq/product>]
  morpheus pm index    [--dir <hq/product>] [--check]
  morpheus pm new <roadmap|goals|requests> <title> [--priority P1] [--goal G-2026-Q3-01]

Options
  --dir <path>   Product directory (default: hq/product)
  --check        Verify indexes are current without writing; exits non-zero if stale
  -h, --help     Show this message
`;

interface Flags {
  dir: string;
  check: boolean;
  priority?: string;
  goal?: string;
  positional: string[];
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { dir: "hq/product", check: false, positional: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--dir":
        flags.dir = argv[++i] ?? flags.dir;
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

  if (group !== "pm") {
    console.error(`Unknown command "${group ?? ""}".\n\n${HELP}`);
    return 1;
  }

  switch (command) {
    case "validate":
      return validate(dir);
    case "index":
      return index(dir, flags.check);
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
