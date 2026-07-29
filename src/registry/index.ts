import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/**
 * A local index of Morpheus projects on this machine.
 *
 * **Derived, never authoritative.** `morpheus.json` in each repo holds the
 * prefix and identity; this file only records where those repos are. A fresh
 * clone has no registry entry and must still work, so nothing may depend on it
 * for correctness — it exists to enable cross-project commands and to catch a
 * prefix collision at allocation time.
 */

export const PREFIX = /^[A-Z]{2,4}$/;

export const RegisteredProject = z.object({
  name: z.string().min(1),
  /** 2–4 uppercase letters, unique across this machine. */
  prefix: z.string().regex(PREFIX, "must be 2-4 uppercase letters"),
  /** Absolute path to the repo root. */
  path: z.string().min(1),
  kind: z.enum(["company", "personal", "internal"]),
  org: z.string().optional(),
});
export type RegisteredProject = z.infer<typeof RegisteredProject>;

export const Registry = z.object({
  version: z.literal(1).default(1),
  projects: z.array(RegisteredProject).default([]),
});
export type Registry = z.infer<typeof Registry>;

export function registryPath(): string {
  return process.env["MORPHEUS_REGISTRY"] ?? join(homedir(), ".morpheus", "registry.json");
}

export async function readRegistry(path = registryPath()): Promise<Registry> {
  try {
    return Registry.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, projects: [] };
    }
    throw err;
  }
}

export async function writeRegistry(reg: Registry, path = registryPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(reg, null, 2)}\n`, "utf8");
}

export class RegistryError extends Error {}

/** Suggest a prefix from a project name, avoiding what is already taken. */
export function suggestPrefix(name: string, taken: Set<string>): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const candidates = [
    letters.slice(0, 2),
    letters.slice(0, 3),
    // First letters of each word: "darwin health" -> "DH"
    name
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 4),
    letters.slice(0, 4),
  ].filter((c) => PREFIX.test(c));

  for (const c of candidates) if (!taken.has(c)) return c;

  // Fall back to appending a digit-free suffix letter until something is free.
  const base = (candidates[0] ?? "PR").slice(0, 2);
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const c = base + ch;
    if (!taken.has(c)) return c;
  }
  throw new RegistryError("Could not derive a free prefix — pass one explicitly.");
}

export interface AddOptions {
  name: string;
  prefix: string;
  path: string;
  kind: RegisteredProject["kind"];
  org?: string;
}

/** Register a project. Rejects a duplicate name, path, or prefix. */
export async function addProject(
  opts: AddOptions,
  path = registryPath(),
): Promise<Registry> {
  const reg = await readRegistry(path);
  const abs = resolve(opts.path);

  const clash = reg.projects.find(
    (p) => p.prefix === opts.prefix && resolve(p.path) !== abs,
  );
  if (clash) {
    throw new RegistryError(
      `Prefix ${opts.prefix} is already used by "${clash.name}" (${clash.path}).`,
    );
  }

  const entry = RegisteredProject.parse({ ...opts, path: abs });
  const rest = reg.projects.filter(
    (p) => resolve(p.path) !== abs && p.name !== opts.name,
  );
  const next: Registry = { version: 1, projects: [...rest, entry].sort((a, b) => a.name.localeCompare(b.name)) };
  await writeRegistry(next, path);
  return next;
}

export async function removeProject(name: string, path = registryPath()): Promise<Registry> {
  const reg = await readRegistry(path);
  const next: Registry = {
    version: 1,
    projects: reg.projects.filter((p) => p.name !== name),
  };
  if (next.projects.length === reg.projects.length) {
    throw new RegistryError(`No project named "${name}" is registered.`);
  }
  await writeRegistry(next, path);
  return next;
}

export function takenPrefixes(reg: Registry): Set<string> {
  return new Set(reg.projects.map((p) => p.prefix));
}
