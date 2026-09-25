export const MORPHEUS_SECURITY_LOGIN = "morpheus-security[bot]";
export const SECURITY_MARKER = "<!-- morpheus-security-update -->";

export function isSecurityDependencyOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every((path) => {
    const base = path.split("/").at(-1) ?? "";
    return [
      "Cargo.lock", "Cargo.toml", "Gemfile", "Gemfile.lock", "composer.json", "composer.lock",
      "go.mod", "go.sum", "package-lock.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
      "pyproject.toml", "uv.lock", "yarn.lock",
    ].includes(base) || /^requirements(?:[-_.].+)?\.txt$/.test(base);
  });
}

export function hasSecurityMarker(body: string): boolean {
  return body.includes(SECURITY_MARKER);
}
