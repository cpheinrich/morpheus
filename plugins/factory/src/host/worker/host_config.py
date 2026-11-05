#!/usr/bin/env python3
"""The one boundary for the private Factory host manifest.

The manifest names this operator's hosts, paths, runners and devices, so it lives outside
Git (default ``$FACTORY_HOME/hosts.json``, ``~/.local/share/factory/hosts.json``), owned by
the login user with no group or other access. It carries references (environment variable
names, credential-project paths), never secret values.

``load`` checks the file and ``validate`` checks the data. A later source such as Firestore
produces the same dict and calls ``validate``; every reader takes the result.

Commands:
  check  [--manifest PATH]               validate and list host names
  import --from PATH [--manifest PATH]   copy an existing manifest; never overwrites
  field  --host HOST --path a.b [--manifest PATH]   print one string field
"""

import argparse
import json
import os
import re
import stat
import sys
from pathlib import Path


class ConfigError(Exception):
    """A manifest that cannot be used. Messages name the path and problem, never content."""


HOST = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]*")
# Shapes of raw credentials. Values are references (variable names, paths), so any string
# that looks like key material is refused rather than carried into logs or plists.
SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
    r"|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,})"
)


def factory_home() -> Path:
    configured = os.environ.get("FACTORY_HOME")
    return Path(configured) if configured else Path.home() / ".local/share/factory"


def default_manifest() -> Path:
    return factory_home() / "hosts.json"


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def validate(data) -> dict:
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise ConfigError("manifest requires schemaVersion 1")
    hosts = data.get("hosts")
    if not isinstance(hosts, dict) or not hosts:
        raise ConfigError("manifest requires a non-empty hosts object")
    for name, entry in hosts.items():
        if not HOST.fullmatch(str(name)) or not isinstance(entry, dict):
            raise ConfigError("manifest host names must be plain identifiers with object entries")
    if any(SECRET.search(text) for text in _strings(data)):
        raise ConfigError("manifest contains a value shaped like a credential; store a reference instead")
    return data


def inside_git(path: Path) -> bool:
    """True when the file's directory, as given or with links resolved, is in a Git workspace."""
    directory = Path(os.path.abspath(path)).parent
    for start in {directory, Path(os.path.realpath(directory))}:
        for ancestor in (start, *start.parents):
            if (ancestor / ".git").exists():
                return True
    return False


def load(path=None) -> dict:
    # The path is used exactly as given: resolving it first would follow a link the
    # checks below must refuse.
    manifest = Path(path) if path is not None else default_manifest()
    if not manifest.is_absolute():
        raise ConfigError(f"manifest path must be absolute: {manifest}")
    if inside_git(manifest):
        raise ConfigError(f"manifest must live outside every Git checkout: {manifest}")
    try:
        info = os.lstat(manifest)
    except FileNotFoundError:
        raise ConfigError(f"manifest not found: {manifest} (create it with host_config.py import)") from None
    except OSError as error:
        raise ConfigError(f"manifest unreadable: {manifest} ({error.strerror})") from None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ConfigError(f"manifest must be a regular file, not a link: {manifest}")
    if info.st_uid != os.getuid():
        raise ConfigError(f"manifest must be owned by the login user: {manifest}")
    if info.st_mode & 0o077:
        raise ConfigError(f"manifest must not be readable by group or others (chmod 600): {manifest}")
    try:
        data = json.loads(manifest.read_text())
    except (OSError, ValueError):
        raise ConfigError(f"manifest is not valid JSON: {manifest}") from None
    return validate(data)


def host_entry(data: dict, host: str) -> dict:
    entry = data["hosts"].get(host)
    if not isinstance(entry, dict):
        raise ConfigError(f"manifest has no entry for host {host}")
    return entry


def import_manifest(source: Path, destination: Path) -> None:
    """Copy a manifest privately: exclusive creation, mode 600, never over an existing file."""
    try:
        data = validate(json.loads(Path(source).read_text()))
    except (OSError, ValueError):
        raise ConfigError(f"source manifest is unreadable or not JSON: {source}") from None
    if not destination.is_absolute():
        raise ConfigError(f"manifest path must be absolute: {destination}")
    if inside_git(destination):
        raise ConfigError(f"manifest must live outside every Git checkout: {destination}")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        raise ConfigError(f"manifest already exists; left unchanged: {destination}") from None
    with os.fdopen(descriptor, "w") as handle:
        handle.write(json.dumps(data, indent=2) + "\n")
    load(destination)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("check", "import", "field"))
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--from", dest="source", type=Path)
    parser.add_argument("--host")
    parser.add_argument("--path")
    args = parser.parse_args(argv)
    manifest = args.manifest or default_manifest()
    try:
        if args.command == "import":
            if not args.source:
                parser.error("import requires --from")
            import_manifest(args.source, manifest)
            print(f"wrote {manifest} (mode 600)")
        elif args.command == "check":
            data = load(manifest)
            print(f"{manifest}: valid; hosts: {', '.join(sorted(data['hosts']))}")
        else:
            if not args.host or not args.path:
                parser.error("field requires --host and --path")
            value = host_entry(load(manifest), args.host)
            for part in args.path.split("."):
                value = value.get(part) if isinstance(value, dict) else None
            if not isinstance(value, str):
                raise ConfigError(f"manifest gives no {args.path} for {args.host}")
            print(value)
    except ConfigError as error:
        print(f"host_config.py: {error}", file=sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    sys.exit(main())
