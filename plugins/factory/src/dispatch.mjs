// Hook helpers: advertise the model-directed Factory contract and identify paths a native edit
// tool would write. Hooks never decide whether a user turn should be delegated.
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
// SessionStart: the Factory is a tool available to the root model, never an automatic router.
export function readiness(mode, route, primary, failure) {
  if (failure) return `Factory is active (experimental), but its delegation tools are not ready: ${failure}`;
  return `Factory is active (experimental) in model-directed mode: ${primary} handles user turns locally unless it calls factory_delegate. Current candidate: ${route?.reason ?? "unavailable"}.`;
}

// File paths a native edit tool call would write, or null when the call is not one this guard
// knows. Shell commands are deliberately not parsed: the guard prevents an accidental race with
// the coordinator's own worker, it is not a sandbox.
export function editTargets(tool, input, cwd) {
  const base = typeof cwd === "string" && cwd ? cwd : process.cwd();
  const at = (p) => (isAbsolute(p) ? p : resolve(base, p));
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const path = input?.file_path ?? input?.notebook_path;
    return typeof path === "string" && path ? [at(path)] : null;
  }
  if (tool === "apply_patch") {
    const raw = typeof input === "string" ? input : input?.command ?? input?.patch ?? input?.input;
    const text = Array.isArray(raw) ? raw.join("\n") : raw;
    if (typeof text !== "string") return null;
    const paths = [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) =>
      at(m[1].trim()),
    );
    return paths.length ? paths : null;
  }
  return null;
}

// Resolves symlinks in the deepest existing ancestor, so a new file in /tmp compares with a
// checkout recorded under /private/tmp.
export async function canonical(path) {
  const missing = [];
  let current = path;
  while (true) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(basename(current));
      current = parent;
    }
  }
}
export function within(path, directory) {
  const rel = relative(directory, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
