#!/usr/bin/env python3
"""Install the reviewed Factory host-update runner as an hourly LaunchAgent.

Service paths point at this package copy (a source checkout or the installed plugin). A
replaced plist is kept as `<plist>.previous`; `--rollback` restores it. A running tick is
never interrupted: installing or rolling back while the job runs refuses with exit 75.
"""

import argparse
import importlib.util
import json
import os
import plistlib
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import host_config  # noqa: E402  the one private-manifest boundary

LABEL = "com.morpheus-factory.host-updates"


def load_controller(root):
    spec = importlib.util.spec_from_file_location("update_controller", root / "worker/update_controller.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def host_check(root, manifest, host, credentials_project, provider_command, provider_url):
    """Run the controller's `check` as the runner will: inside the host's credentials project."""
    env = dict(os.environ)
    if provider_command:
        env["FACTORY_VERIFICATION_CODE_COMMAND"] = str(provider_command)
        env["FACTORY_VERIFICATION_CODE_URL"] = provider_url
    result = subprocess.run(["morpheus", "credentials", "run", "--", sys.executable, str(root / "worker/update_controller.py"),
                             "check", "--host", host, "--manifest", str(manifest), "--json"],
                            cwd=credentials_project, env=env, text=True, capture_output=True, check=False)
    try:
        document = json.loads(result.stdout or "")
        checks = [(item["name"], bool(item["ok"]), str(item["detail"]), bool(item.get("blocking", True))) for item in document["checks"]]
        ok = bool(document["ok"]) and result.returncode == 0
    except (ValueError, KeyError, TypeError):
        # stderr is the controller's own one-line refusal, never child output.
        return False, [("check", False, (result.stderr or "").strip() or f"controller check exited {result.returncode}", True)]
    return ok, checks


def job_running(domain):
    """True while launchd reports a PID for the loaded job (`state = running`)."""
    result = subprocess.run(["launchctl", "print", f"{domain}/{LABEL}"], check=False, capture_output=True, text=True)
    return result.returncode == 0 and re.search(r"^\s*pid = \d+\s*$", result.stdout, re.M) is not None


def bootstrap(domain, target):
    subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=False, capture_output=True)
    for attempt in range(5):
        result = subprocess.run(["launchctl", "bootstrap", domain, str(target)], check=False, capture_output=True)
        if result.returncode == 0:
            return
        if attempt == 4:
            raise RuntimeError("LaunchAgent bootstrap failed after five attempts")
        time.sleep(2)


def rollback(parser, target, domain):
    previous = target.with_name(target.name + ".previous")
    if not previous.is_file():
        parser.exit(78, f"install_updates.py: no previous LaunchAgent to restore at {previous}\n")
    if job_running(domain):
        parser.exit(75, "install_updates.py: the host-update job is running; retry rollback after it finishes\n")
    subprocess.run(["plutil", "-lint", str(previous)], check=True, capture_output=True)
    previous.replace(target)
    bootstrap(domain, target)
    print(f"restored the previous {LABEL}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host")
    parser.add_argument("--manifest", type=Path, help="private host manifest; defaults to $FACTORY_HOME/hosts.json")
    parser.add_argument("--credentials-project", type=Path, help="defaults to the host's paths.credentialsProject in the manifest")
    parser.add_argument("--github-user", help="GitHub login whose stored gh auth the fleet PR agent uses (required to install)")
    parser.add_argument("--rollback", action="store_true", help="restore the LaunchAgent this installer last replaced")
    parser.add_argument("--provider-command", type=Path)
    parser.add_argument("--provider-url")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    runner = root / "worker/update_runner.sh"
    target = Path.home() / f"Library/LaunchAgents/{LABEL}.plist"
    domain = f"gui/{os.getuid()}"
    if args.rollback:
        return rollback(parser, target, domain)
    if not args.host:
        parser.error("--host is required")
    manifest = Path(os.path.abspath(args.manifest or host_config.default_manifest()))
    try:
        host_config.load(manifest)
    except host_config.ConfigError as error:
        parser.error(str(error))
    if not runner.is_file():
        parser.error(f"runner missing from this package: {runner}")
    if args.credentials_project is None:
        try:
            args.credentials_project = Path(load_controller(root).pin_for_host(manifest, args.host).paths["credentialsProject"])
        except Exception as error:
            parser.error(f"no --credentials-project and the manifest gives none for {args.host}: {error}")
    if not args.credentials_project.is_dir():
        parser.error("credentials project must exist")
    if args.check:
        print("manifest: present")
        print(f"credentials project: {args.credentials_project}")
        print(f"LaunchAgent: {'installed' if target.is_file() else 'missing'}")
        print(f"verification provider: {'configured' if args.provider_command and args.provider_url else 'missing'}")
        ok, checks = host_check(root, manifest, args.host, args.credentials_project, args.provider_command, args.provider_url)
        for name, passed, detail, blocking in checks:
            print(f"{name}: {'ok' if passed else ('FAIL' if blocking else 'WARN')} - {detail}")
        sys.exit(0 if ok else 1)
    if not args.github_user or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", args.github_user):
        parser.error("GitHub user must be an account login")
    if bool(args.provider_command) != bool(args.provider_url):
        parser.error("provider command and URL must be supplied together")
    if args.provider_command and (not args.provider_command.is_absolute() or not os.access(args.provider_command, os.X_OK)):
        parser.error("provider command must be an executable absolute path")
    if args.provider_url and not args.provider_url.startswith("https://"):
        parser.error("provider URL must use HTTPS")
    ok, checks = host_check(root, manifest, args.host, args.credentials_project, args.provider_command, args.provider_url)
    # Only checks that gate Factory's own actions refuse the install; the rest warn.
    blocking_failures = [f"{name}: {detail}" for name, passed, detail, blocking in checks if not passed and blocking]
    if blocking_failures:
        parser.exit(1, f"install_updates.py: host check failed, not installing: {'; '.join(blocking_failures)}\n")
    for name, passed, detail, blocking in checks:
        if not passed:
            print(f"warning: {name}: {detail}")
    target.parent.mkdir(parents=True, exist_ok=True)
    arguments = ["/bin/bash", str(runner), "--host", args.host, "--manifest", str(manifest), "--credentials-project", str(args.credentials_project.resolve()), "--github-user", args.github_user]
    if args.provider_command:
        arguments.extend(["--provider-command", str(args.provider_command), "--provider-url", args.provider_url])
    if job_running(domain):
        parser.exit(75, "install_updates.py: the host-update job is running; retry after it finishes\n")
    document = {
        "Label": LABEL,
        "ProgramArguments": arguments,
        "RunAtLoad": True,
        "StartInterval": 3600,
        "EnvironmentVariables": {"PATH": f"{Path.home()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"},
        "StandardOutPath": str(Path.home() / "Library/Logs/morpheus-factory/host-updates.log"),
        "StandardErrorPath": str(Path.home() / "Library/Logs/morpheus-factory/host-updates.log"),
    }
    Path(document["StandardOutPath"]).parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(plistlib.dumps(document))
    os.chmod(temporary, 0o600)
    subprocess.run(["plutil", "-lint", str(temporary)], check=True, capture_output=True)
    if target.is_file() and target.read_bytes() != temporary.read_bytes():
        previous = target.with_name(target.name + ".previous")
        previous.write_bytes(target.read_bytes())
        os.chmod(previous, 0o600)
    temporary.replace(target)
    bootstrap(domain, target)
    print(f"installed {LABEL} for {args.host} from {root}")


if __name__ == "__main__":
    main()
