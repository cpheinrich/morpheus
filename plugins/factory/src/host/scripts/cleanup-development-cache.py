#!/usr/bin/env python3
"""Reclaim disposable developer data on a macOS worker.

Dry run by default. The hourly launchd job passes --watch. This deliberately
does not touch installed simulator runtimes, normal simulator devices, browser
profiles, repositories, credentials, or application support databases.
"""

import argparse
import fcntl
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


HOME = Path.home()
JOB_ID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
# Morpheus's own CI devices are built in. Projects add theirs in the operator's
# ~/.config/morpheus-factory/simulators.json, so no project name ships here:
#   {"jobDevices": ["Example Test"],
#    "previews": [{"device": "Example QA", "namespace": "com.example.preview"}]}
# A job device is "<prefix> <UUID>". A preview device is "<device> <12-hex key>",
# owned by ~/Library/Caches/<namespace>/<key>/session.json or launchd <namespace>.<key>.
CI_NAME = re.compile(rf"Morpheus CI {JOB_ID}\Z")
DEVICE_PREFIX = re.compile(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,40}\Z")
NAMESPACE = re.compile(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+\Z")
CLONE_NAME = re.compile(rf"Clone [0-9]+ of Morpheus CI {JOB_ID}\Z")
XCODE_INSTALLER = re.compile(r"Xcode(?:[._ -].*)?\.xip\Z", re.IGNORECASE)
DAY = 86400
LEASE_DIR = HOME / ".local/state/morpheus-factory/simulator-leases"
UDID = re.compile(JOB_ID + r"\Z")


def log(message):
    print(message, flush=True)


def run(command, apply):
    log("$ " + " ".join(command))
    if apply:
        subprocess.run(command, check=True)


def space_gib():
    stat = os.statvfs(HOME)
    unit = 1024 ** 3
    return stat.f_bavail * stat.f_frsize / unit, stat.f_blocks * stat.f_frsize / unit


def spotlight_index_gib():
    store = Path("/System/Volumes/Data/.Spotlight-V100")
    if not store.is_dir():
        return 0.0
    output = subprocess.check_output(["sudo", "-n", "/usr/bin/du", "-sk", str(store)], text=True)
    return int(output.split()[0]) / 1024 ** 2


def reset_large_spotlight_index(apply, limit_gib=5):
    size = spotlight_index_gib()
    log(f"Spotlight index: {size:.1f} GiB; reset threshold {limit_gib} GiB")
    if size <= limit_gib:
        return False
    volume = "/System/Volumes/Data"
    status = subprocess.check_output(["/usr/bin/mdutil", "-s", volume], text=True)
    if "Indexing enabled." not in status and "Indexing disabled." not in status:
        raise RuntimeError("Cannot determine Spotlight indexing state; retain index")
    enabled = "Indexing enabled." in status
    if apply:
        try:
            run(["sudo", "-n", "/usr/bin/mdutil", "-E", volume], True)
        finally:
            if enabled:
                run(["sudo", "-n", "/usr/bin/mdutil", "-i", "on", volume], True)
    else:
        log(f"Would reset Spotlight index on {volume}")
    return True


def watch_limits(total_gib, base_floor=50, min_free_percent=15):
    floor = max(base_floor, math.ceil(total_gib * min_free_percent / 100))
    return floor, floor + 30


def execute_stages(stages, target=None, free_space=None):
    """Run least disruptive steps first; stop once a watchdog has its reserve."""
    failures = []
    for label, action in stages:
        if target is not None and free_space() >= target:
            log(f"Target reserve reached before {label}; stopping cleanup")
            break
        try:
            action()
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, RuntimeError) as error:
            failures.append(f"{label}: {error}")
    return failures


def remove_old_children(parent, days, apply, target=None):
    if not parent.is_dir() or parent.is_symlink():
        return 0
    cutoff = time.time() - days * DAY
    count = 0
    candidates = []
    for path in parent.iterdir():
        if path.is_symlink() or not path.is_dir():
            continue
        modified = path.stat().st_mtime
        if modified < cutoff:
            candidates.append((modified, path))
    for _, path in sorted(candidates, key=lambda item: (item[0], str(item[1]))):
        if target is not None and space_gib()[0] >= target:
            break
        log(f"{'Remove' if apply else 'Would remove'} {path}")
        if apply:
            shutil.rmtree(path)
        count += 1
    return count


def installer_candidates(downloads):
    candidates = list(downloads.iterdir())
    ibkr = downloads / "ibkr"
    if ibkr.is_dir() and not ibkr.is_symlink():
        candidates.extend(ibkr.iterdir())
    return candidates


def installed_app_names(applications):
    installed = []
    for root in (applications, HOME / "Applications"):
        if root.is_dir() and not root.is_symlink():
            installed.extend(app.stem for app in root.glob("*.app") if app.is_dir() and not app.is_symlink())
    return installed


def matches_installed_app(stem, installed):
    for app in installed:
        parts = re.findall(r"[a-z0-9]+", app.lower())
        while parts and parts[-1].isdigit():
            parts.pop()
        if not parts:
            continue
        prefix = r"[\s._-]*".join(re.escape(part) for part in parts)
        if re.match(rf"^{prefix}(?:[\s._-]|$)", stem.lower()):
            return True
    return False


def installer_is_eligible(path, installed, xcode_installed):
    """An installer file or "* Installer.app" whose application is already installed."""
    if path.is_symlink():
        return False
    suffix = path.suffix.lower()
    installer_app = suffix == ".app" and path.is_dir() and path.stem.lower().endswith(" installer")
    if not (suffix in (".dmg", ".pkg", ".xip") and path.is_file() or installer_app):
        return False
    if suffix == ".xip":
        return bool(XCODE_INSTALLER.fullmatch(path.name) and xcode_installed)
    return matches_installed_app(path.stem, installed)


def remove_entry(path):
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def remove_installed_app_installers(downloads, apply, applications=Path("/Applications")):
    """Remove Downloads installers that match an installed application name."""
    if not downloads.is_dir() or downloads.is_symlink():
        return 0
    candidates = installer_candidates(downloads)
    installed = installed_app_names(applications)
    xcode_installed = any(name.lower().startswith("xcode") for name in installed)
    count = 0
    for path in sorted(candidates):
        if not installer_is_eligible(path, installed, xcode_installed):
            continue
        log(f"{'Remove' if apply else 'Would remove'} installed-app installer {path}")
        if apply:
            remove_entry(path)
        count += 1
    return count


def remove_old_trash(trash, days, apply):
    """Use the latest inode timestamp so recently trashed items are retained."""
    if not trash.is_dir() or trash.is_symlink():
        return 0
    cutoff = time.time() - days * DAY
    count = 0
    for path in sorted(trash.iterdir()):
        if path.name in (".DS_Store", ".localized"):
            continue
        info = path.lstat()
        if max(info.st_ctime, getattr(info, "st_birthtime", info.st_ctime)) >= cutoff:
            continue
        log(f"{'Remove' if apply else 'Would remove'} old Trash entry {path}")
        if apply:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink()
        count += 1
    return count


def swift_build_is_running():
    commands = subprocess.check_output(["ps", "ax", "-o", "comm="], text=True)
    return any(Path(command).name in ("swift", "swiftc", "swift-frontend", "xcodebuild")
               for command in commands.splitlines())


def xcode_editor_is_running():
    commands = subprocess.check_output(["ps", "ax", "-o", "comm="], text=True)
    return any(re.search(r"/Xcode(?:-beta)?\.app/Contents/MacOS/Xcode\Z", command)
               for command in commands.splitlines())


def prune_large_swiftpm_cache(cache, limit_gib, apply):
    if not cache.is_dir() or cache.is_symlink():
        return False
    size_kib = int(subprocess.check_output(["du", "-sk", str(cache)], text=True).split()[0])
    size_gib = size_kib / 1024 ** 2
    log(f"SwiftPM cache: {size_gib:.1f} GiB; cleanup threshold {limit_gib} GiB")
    if size_gib <= limit_gib:
        return False
    if swift_build_is_running():
        log("Swift or Xcode build running; skipping SwiftPM cache")
        return False
    if not shutil.which("swift"):
        log("swift unavailable; skipping SwiftPM cache")
        return False
    run(["swift", "package", "purge-cache", "--cache-path", str(cache)], apply)
    # SwiftPM's purge-cache command clears repositories, but leaves these
    # reproducible downloads and compiled manifests in the same cache root.
    for name in ("artifacts", "manifests"):
        path = cache / name
        if not path.is_dir() or path.is_symlink():
            continue
        log(f"{'Remove' if apply else 'Would remove'} SwiftPM {name} cache {path}")
        if apply:
            shutil.rmtree(path)
    return True


def app_is_running(app_names):
    """Cache directories may contain open Chromium files while their app runs."""
    commands = subprocess.check_output(["ps", "ax", "-o", "comm="], text=True)
    return any(f"/{name}.app/Contents/" in command for command in commands.splitlines()
               for name in app_names)


def remove_app_cache_contents(root, cache_names, app_names, apply):
    if app_is_running(app_names):
        log(f"{app_names[0]} running; skipping its application caches")
        return 0
    count = 0
    for name in cache_names:
        cache = root / name
        if not cache.is_dir() or cache.is_symlink():
            continue
        for path in cache.iterdir():
            log(f"{'Remove' if apply else 'Would remove'} application cache {path}")
            if apply:
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            count += 1
    return count


def valid_job_prefixes(jobs):
    return isinstance(jobs, list) and all(isinstance(p, str) and DEVICE_PREFIX.fullmatch(p) for p in jobs)


def valid_preview(preview):
    return bool(isinstance(preview, dict) and set(preview) == {"device", "namespace"}
                and isinstance(preview["device"], str) and DEVICE_PREFIX.fullmatch(preview["device"])
                and isinstance(preview["namespace"], str) and NAMESPACE.fullmatch(preview["namespace"]))


def simulator_config():
    """Operator-declared job prefixes and preview namespaces; absent means none."""
    path = HOME / ".config/morpheus-factory/simulators.json"
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        return [], []
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Cannot read {path}: {error}") from None
    jobs = data.get("jobDevices", [])
    previews = data.get("previews", [])
    if not valid_job_prefixes(jobs) or not isinstance(previews, list) or not all(map(valid_preview, previews)):
        raise RuntimeError(f"Invalid {path}: jobDevices are name prefixes; previews are {{device, namespace}}")
    return jobs, [(p["device"], p["namespace"]) for p in previews]


def is_job_device(name, jobs):
    return bool(CI_NAME.fullmatch(name) or CLONE_NAME.fullmatch(name)
                or any(re.fullmatch(rf"{re.escape(prefix)} {JOB_ID}", name) for prefix in jobs))


def preview_namespace(name, previews):
    """The namespace owning a preview device name, or None."""
    for device, namespace in previews:
        if re.fullmatch(rf"{re.escape(device)} [0-9a-f]{{12}}", name):
            return namespace
    return None


def preview_is_owned(device, now, namespace):
    """A live preview lease or launchd supervisor owns its exact device."""
    key = device["name"].split()[-1]
    state_file = HOME / "Library/Caches" / namespace / key / "session.json"
    label = f"gui/{os.getuid()}/{namespace}.{key}"
    if subprocess.run(["launchctl", "print", label], stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL).returncode == 0:
        return True
    if not state_file.exists():
        return False
    try:
        state = json.loads(state_file.read_text())
    except (OSError, ValueError):
        return True  # unknown ownership is protected
    return state.get("udid") == device["udid"] and state.get("expiresAt", 0) > now * 1000


def worker_lease_is_active(udid, now):
    lease = LEASE_DIR / f"{udid}.json"
    if not lease.exists():
        return False
    try:
        data = json.loads(lease.read_text())
        return data.get("udid") != udid or float(data["expiresAt"]) > now
    except (OSError, ValueError, TypeError, KeyError):
        return True  # unreadable lease must not authorize deletion


def update_worker_lease(udid, minutes, release):
    if not UDID.fullmatch(udid):
        raise ValueError("invalid simulator UDID")
    LEASE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = LEASE_DIR / f"{udid}.json"
    if release:
        path.unlink(missing_ok=True)
        log(f"Released simulator lease {udid}")
    else:
        temporary = LEASE_DIR / f"{udid}.tmp"
        temporary.write_text(json.dumps({"udid": udid, "expiresAt": time.time() + minutes * 60}))
        temporary.chmod(0o600)
        temporary.replace(path)
        log(f"Leased simulator {udid} for {minutes} minutes")


def simulator_inventories():
    """The default device set, plus XCTest's clone set when it exists."""
    inventories = [([], json.loads(subprocess.check_output(
        ["xcrun", "simctl", "list", "devices", "-j"], text=True
    )))]
    testing = subprocess.run(["xcrun", "simctl", "--set", "testing", "list", "devices", "-j"],
                             text=True, capture_output=True)
    if testing.returncode == 0:
        inventories.append((["--set", "testing"], json.loads(testing.stdout)))
    elif "Provided set path does not exist" not in testing.stderr:
        raise RuntimeError("Cannot inventory XCTest simulator set")
    return inventories


class SimulatorSweep:
    """Host facts read once per sweep, and the per-device deletion verdict."""

    def __init__(self, qa_days, job_days):
        self.qa_days, self.job_days = qa_days, job_days
        self.devices_root = HOME / "Library/Developer/CoreSimulator/Devices"
        self.jobs, self.previews = simulator_config()
        self.now = time.time()
        self.processes = subprocess.check_output(["ps", "ax", "-o", "command="], text=True)
        self.build_active = subprocess.run(["pgrep", "-f", "[x]codebuild"],
                                           stdout=subprocess.DEVNULL).returncode == 0

    def stale(self, device, days):
        directory = Path(device.get("dataPath") or self.devices_root / device["udid"])
        if not directory.is_dir() or directory.is_symlink():
            return False
        return directory.stat().st_mtime < self.now - days * DAY

    def protection(self, device, namespace, is_qa, is_job):
        """Why an old, unowned-looking device must stay, or None to delete it."""
        name, udid = device["name"], device["udid"]
        if udid in self.processes or name in self.processes:
            return "referenced by a live process"
        if worker_lease_is_active(udid, self.now):
            return "worker lease"
        if is_qa and preview_is_owned(device, self.now, namespace):
            return "preview lease or supervisor"
        if is_job and self.build_active:
            return "build activity on host"
        return None

    def verdict(self, device):
        """None to delete; "" to pass over silently; otherwise the logged protection."""
        name, _ = device["name"], device["udid"]  # both required, as simctl always reports them
        namespace = preview_namespace(name, self.previews)
        is_qa = namespace is not None
        is_job = is_job_device(name, self.jobs)
        if not (is_qa or is_job) or device["state"] != "Shutdown":
            return ""
        if not self.stale(device, self.qa_days if is_qa else self.job_days):
            return ""
        return self.protection(device, namespace, is_qa, is_job)


def remove_old_simulators(qa_days, job_days, apply):
    if not shutil.which("xcrun"):
        log("xcrun unavailable; skipping simulators")
        return 0
    inventories = simulator_inventories()
    sweep = SimulatorSweep(qa_days, job_days)
    count = 0
    for selector, inventory in inventories:
        for device in (d for group in inventory["devices"].values() for d in group):
            verdict = sweep.verdict(device)
            if verdict:
                log(f"Protect {device['name']} ({device['udid']}): {verdict}")
            if verdict is not None:
                continue
            run(["xcrun", "simctl", *selector, "delete", device["udid"]], apply)
            count += 1
    return count


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="perform eligible manual cleanup; Spotlight still requires storage pressure")
    mode.add_argument("--watch", action="store_true", help="hourly Trash retention and pressure-based cache cleanup")
    parser.add_argument("--min-free-gb", type=int, default=50,
                        help="minimum reserve; watchdog also uses a percentage of volume capacity")
    parser.add_argument("--min-free-percent", type=int, default=15,
                        help="minimum free-space percentage for the watchdog (default: 15)")
    parser.add_argument("--simulator-days", type=int, default=14)
    parser.add_argument("--build-days", type=int, default=7)
    parser.add_argument("--job-simulator-days", type=int, default=2)
    parser.add_argument("--trash-days", type=int, default=30)
    lease = parser.add_mutually_exclusive_group()
    lease.add_argument("--lease-udid")
    lease.add_argument("--release-udid")
    parser.add_argument("--lease-minutes", type=int, default=720)
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("macOS required")
    if (args.simulator_days < 2 or args.build_days < 7 or args.job_simulator_days < 2
            or args.trash_days < 30):
        parser.error("retention is too short")
    if args.min_free_gb < 10:
        parser.error("minimum free space must be at least 10 GiB")
    if not 5 <= args.min_free_percent <= 50:
        parser.error("minimum free percentage must be 5–50")
    if not 1 <= args.lease_minutes <= 1440:
        parser.error("lease minutes must be 1–1440")
    return parser, args


def storage_state(args, apply):
    """Free space, pressure floor, watchdog target and whether a watch run is healthy."""
    target = None
    healthy_watch = False
    if args.watch:
        available, total = space_gib()
        floor, target = watch_limits(total, args.min_free_gb, args.min_free_percent)
        log(f"Storage watchdog: {available:.1f} GiB free; floor {floor} GiB; target {target} GiB")
        if available >= floor:
            healthy_watch = True
            log("Reserve healthy; checking old Trash entries only")
    else:
        available, total = space_gib()
        floor, _ = watch_limits(total, args.min_free_gb, args.min_free_percent)
        log(f"Development cleanup: {'apply' if apply else 'dry run'}; "
            f"{available:.1f} GiB free; pressure floor {floor} GiB")
    return available, floor, target, healthy_watch


def cleanup_stages(args, apply, target, pressure):
    """Least disruptive first; pressure adds the Spotlight and recent-build fallbacks."""
    def simulators():
        count = remove_old_simulators(args.simulator_days, args.job_simulator_days, apply)
        log(f"Unowned shutdown QA and CI/CD simulators: {count}")

    def installers():
        count = remove_installed_app_installers(HOME / "Downloads", apply)
        log(f"Installed-app installers: {count}")

    def trash():
        count = remove_old_trash(HOME / ".Trash", args.trash_days, apply)
        log(f"Trash entries older than {args.trash_days} days: {count}")

    def unused_apple_apps():
        helper = Path(__file__).with_name("morpheus-unused-apps-cleanup")
        if not helper.is_file():
            helper = Path(__file__).resolve().parents[1] / "worker/setup/apps.sh"
        if not helper.is_file():
            raise RuntimeError("Unused Apple app cleanup helper missing")
        environment = os.environ.copy()
        environment["WORKER_CHECK_ONLY"] = "0" if apply else "1"
        log(f"$ bash {helper} ({'apply' if apply else 'check'})")
        subprocess.run(["bash", str(helper)], env=environment, check=True)

    def spotlight_exclusions():
        helper = Path(__file__).with_name("morpheus-spotlight-exclusions")
        if not helper.is_file():
            helper = Path(__file__).resolve().parents[1] / "worker/setup/spotlight.sh"
        if not helper.is_file():
            raise RuntimeError("Spotlight exclusion helper missing")
        code_root_file = HOME / ".config/morpheus-factory/code-root"
        code_root = code_root_file.read_text().strip() if code_root_file.is_file() else str(HOME / "code")
        environment = os.environ.copy()
        environment["WORKER_CHECK_ONLY"] = "0" if apply else "1"
        environment["WORKER_CODE_ROOT"] = code_root
        log(f"$ bash {helper} ({'apply' if apply else 'check'})")
        subprocess.run(["bash", str(helper)], env=environment, check=True)

    def derived_data(days, label):
        # A running build or open Xcode may be writing inside DerivedData.
        if swift_build_is_running() or xcode_editor_is_running():
            log("Swift or Xcode active; skipping DerivedData")
        else:
            count = remove_old_children(
                HOME / "Library/Developer/Xcode/DerivedData", days, apply, target
            )
            log(f"{label} DerivedData directories: {count}")

    def npx():
        if subprocess.run(["pgrep", "-f", "[n]px"], stdout=subprocess.DEVNULL).returncode == 0:
            log("npx running; skipping old npx installs")
            return
        count = remove_old_children(HOME / ".npm/_npx", args.simulator_days, apply)
        log(f"Old npx installs: {count}")

    def package_cache(label, command):
        if not shutil.which(command[0]):
            log(f"{label} unavailable; skipping")
            return
        active_pattern = {"npm": "[n]pm", "pnpm": "[p]npm", "uv": "[u]v ",
                          "Homebrew": "[b]rew ", "pip": "[p]ip "}[label]
        if subprocess.run(["pgrep", "-f", active_pattern], stdout=subprocess.DEVNULL).returncode == 0:
            log(f"{label} active; skipping cache cleanup")
            return
        if label == "pip" and apply:
            log("$ " + " ".join(command))
            result = subprocess.run(command, text=True, capture_output=True)
            if result.stdout.strip():
                log(result.stdout.strip())
            if result.stderr.strip() and "No matching packages" not in result.stderr:
                log(result.stderr.strip())
            if result.returncode and "No matching packages" not in result.stderr:
                raise RuntimeError(f"exit {result.returncode}")
        else:
            run(command, apply)

    def worktrees():
        helper = Path(__file__).with_name("cleanup-old-worktrees.py")
        if not helper.is_file():
            raise RuntimeError(f"Worktree cleanup helper missing: {helper}")
        command = [sys.executable, str(helper)]
        code_root_file = HOME / ".config/morpheus-factory/code-root"
        if code_root_file.is_file():
            command.extend(["--code-root", code_root_file.read_text().strip()])
        if apply:
            command.append("--apply")
        if target is not None:
            command.extend(["--target-free-gb", str(target)])
        run(command, True)

    def agent_app_caches():
        claude_root = HOME / "Library/Application Support/Claude"
        claude = remove_app_cache_contents(
            claude_root,
            ("Cache", "Code Cache", "GPUCache", "GraphiteDawnCache", "DawnGraphiteCache",
             "DawnWebGPUCache", "GPUPersistentCache"),
            ("Claude",), apply,
        )
        claude += remove_app_cache_contents(
            HOME / "Library/Caches", ("com.anthropic.claudefordesktop",),
            ("Claude",), apply,
        )
        codex_root = HOME / "Library/Application Support/Codex"
        codex = remove_app_cache_contents(
            codex_root, ("GraphiteDawnCache", "GPUCache", "Code Cache"),
            ("ChatGPT", "Codex"), apply,
        )
        codex += remove_app_cache_contents(
            HOME / ".codex", ("cache",), ("ChatGPT", "Codex"), apply,
        )
        log(f"Claude and Codex disposable application cache entries: {claude + codex}")

    stages = [
        ("Trash", trash),
        ("installers", installers),
        ("unused Apple apps", unused_apple_apps),
        ("simulators", simulators),
        ("DerivedData", lambda: derived_data(args.build_days, "Old")),
        ("npx", npx),
        ("SwiftPM", lambda: prune_large_swiftpm_cache(
            HOME / "Library/Caches/org.swift.swiftpm", 5, apply)),
        ("uv", lambda: package_cache("uv", ["uv", "cache", "prune"])),
        ("Homebrew", lambda: package_cache("Homebrew", ["brew", "cleanup", "--prune=30"])),
    ]
    if importlib.util.find_spec("pip"):
        stages.append(("pip", lambda: package_cache("pip", [sys.executable, "-m", "pip", "cache", "purge"])))
    stages.extend([
        ("pnpm", lambda: package_cache("pnpm", ["pnpm", "store", "prune"])),
        ("npm", lambda: package_cache("npm", ["npm", "cache", "clean", "--force"])),
        ("agent application caches", agent_app_caches),
        ("worktrees", worktrees),
    ])
    if pressure:
        stages.extend([
            ("Spotlight exclusions", spotlight_exclusions),
            ("Spotlight", lambda: reset_large_spotlight_index(apply)),
            ("recent DerivedData", lambda: derived_data(1, "Fallback")),
        ])
    return stages


def run_stages_locked(stages, healthy_watch, target):
    """Stage failures, or None when another cleanup holds the lock."""
    lock_dir = HOME / ".local/state/morpheus-factory"
    lock_dir.mkdir(parents=True, exist_ok=True)
    with (lock_dir / "storage-watchdog.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("Another cleanup is running; skipping")
            return None
        return execute_stages(stages[:1] if healthy_watch else stages,
                              None if healthy_watch else target, lambda: space_gib()[0])


def main():
    parser, args = parse_args()
    if args.lease_udid or args.release_udid:
        try:
            update_worker_lease(args.lease_udid or args.release_udid, args.lease_minutes,
                                bool(args.release_udid))
        except ValueError as error:
            parser.error(str(error))
        return 0
    apply = args.apply or args.watch
    available, floor, target, healthy_watch = storage_state(args, apply)
    pressure = available < floor
    failures = run_stages_locked(cleanup_stages(args, apply, target, pressure), healthy_watch, target)
    if failures is None:
        return 0
    if failures:
        for failure in failures:
            log("ERROR " + failure)
        return 1
    ending_free, _ = space_gib()
    log(f"Cleanup result: {ending_free:.1f} GiB free "
        f"({ending_free - available:+.1f} GiB during this run)")
    if apply and pressure and ending_free < floor:
        log("ERROR Free space remains below the reserve after eligible cleanup")
        return 2
    log("Cleanup complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
