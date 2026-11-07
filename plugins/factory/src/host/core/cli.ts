#!/usr/bin/env node
/**
 * Operator entry point.
 *
 * This planner resolves placement and admission only; it does not execute workers.
 * Exit codes: 0 resolved, 75 refused and requeueable, 78 configuration or usage.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseConfig, type FactoryConfig } from "./config.js";
import { createBroker } from "./brokers/index.js";
import { plan } from "./plan.js";
import type { RunRequest } from "./types.js";

const USAGE = `factory <command> [options]

  plan --task <id> --profile <id> [--host <id>] [--workspace <path>] [--config <path>]
      Resolve one run into a spec, or print the refusal that stopped it.
  profiles [--config <path>]    List the profile catalog.
  hosts [--config <path>]       List hosts and eligibility.

Options:
  --config <path>   Configuration file (default: $FACTORY_CONFIG or ./factory.json)
`;

const REFUSED = 75;
const CONFIG = 78;

type Flags = Record<string, string>;

async function loadConfig(flags: Flags): Promise<FactoryConfig | null> {
  const configPath = resolve(flags.config ?? process.env.FACTORY_CONFIG ?? "factory.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable";
    process.stderr.write(`factory: cannot read ${configPath}: ${detail}\n`);
    return null;
  }
  const parsed = parseConfig(raw);
  if (!parsed.ok) {
    process.stderr.write(`factory: ${configPath} is invalid\n`);
    for (const issue of parsed.issues) process.stderr.write(`  ${issue.path || "(root)"}: ${issue.message}\n`);
    return null;
  }
  return parsed.config;
}

function printJson(value: unknown): number {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return 0;
}

async function runPlan(flags: Flags, config: FactoryConfig): Promise<number> {
  if (flags.task === undefined || flags.task === "" || flags.profile === undefined || flags.profile === "") {
    process.stderr.write("factory: plan requires --task and --profile\n");
    return CONFIG;
  }
  const request: RunRequest = { task: flags.task, profile: flags.profile };
  if (flags.host !== undefined) request.host = flags.host;
  if (flags.workspace !== undefined) request.workspace = flags.workspace;

  const broker = createBroker(config.broker);
  const result = await plan(request, config, broker);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : REFUSED;
}

// A Map, not an object literal, so a command such as "constructor" is unknown.
const COMMANDS = new Map<string, (flags: Flags, config: FactoryConfig) => number | Promise<number>>([
  ["profiles", (_flags, config) => printJson(config.profiles)],
  ["hosts", (_flags, config) => printJson(config.hosts)],
  ["plan", runPlan],
]);

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (command === undefined || command === "help" || command === "--help") {
    process.stdout.write(USAGE);
    return command === undefined ? CONFIG : 0;
  }

  // The configuration is read before the command is resolved, so an unknown
  // command still reports an unreadable or invalid configuration first.
  const config = await loadConfig(flags);
  if (config === null) return CONFIG;
  const handler = COMMANDS.get(command);
  if (handler !== undefined) return handler(flags, config);

  process.stderr.write(`factory: unknown command "${command}"\n\n${USAGE}`);
  return CONFIG;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined || !token.startsWith("--")) continue;
    const name = token.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      flags[name] = "";
      continue;
    }
    flags[name] = value;
    index += 1;
  }
  return flags;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`factory: ${error instanceof Error ? error.message : "unexpected failure"}\n`);
    process.exit(1);
  },
);
