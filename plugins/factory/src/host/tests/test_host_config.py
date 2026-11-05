import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import host_config  # noqa: E402

from manifest_fixture import EXAMPLE, write_private  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
def load_module(name, relative):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look their module up while it loads
    spec.loader.exec_module(module)
    return module


MINIMAL = {"schemaVersion": 1, "hosts": {"mini": {"xcode": {"version": "27.2", "build": "27B52"}}}}


class HostConfigTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.dir = Path(temporary.name).resolve()
        self.path = self.dir / "hosts.json"

    def write(self, data, mode=0o600):
        self.path.write_text(json.dumps(data))
        os.chmod(self.path, mode)
        return self.path

    def refused(self, message, path=None):
        with self.assertRaisesRegex(host_config.ConfigError, message):
            host_config.load(path or self.path)

    def test_owner_only_regular_file_loads(self):
        self.assertEqual(host_config.load(self.write(MINIMAL)), MINIMAL)

    def test_any_group_or_other_bit_is_refused(self):
        for mode in (0o640, 0o604, 0o620, 0o602, 0o601, 0o610):
            self.write(MINIMAL, mode)
            self.refused("chmod 600")

    def test_another_owner_is_refused(self):
        self.write(MINIMAL)
        with patch.object(host_config.os, "getuid", return_value=os.getuid() + 1):
            self.refused("owned by the login user")

    def test_links_directories_and_relative_paths_are_refused(self):
        real = self.write(MINIMAL)
        link = self.dir / "link.json"
        link.symlink_to(real)
        self.refused("regular file", link)
        self.refused("regular file", self.dir)
        self.refused("absolute", Path("hosts.json"))

    def test_a_manifest_inside_any_git_checkout_is_refused(self):
        checkout = self.dir / "checkout"
        (checkout / ".git").mkdir(parents=True)
        nested = checkout / "plugins/factory/src/host/hosts.json"
        nested.parent.mkdir(parents=True)
        nested.write_text(json.dumps(MINIMAL))
        os.chmod(nested, 0o600)
        self.refused("outside every Git checkout", nested)
        # A linked worktree has a .git file, not a directory.
        worktree = self.dir / "worktree"
        worktree.mkdir()
        (worktree / ".git").write_text("gitdir: /elsewhere\n")
        inside = worktree / "hosts.json"
        inside.write_text(json.dumps(MINIMAL))
        os.chmod(inside, 0o600)
        self.refused("outside every Git checkout", inside)

    def test_a_factory_home_linked_into_a_checkout_is_refused(self):
        checkout = self.dir / "checkout"
        (checkout / ".git").mkdir(parents=True)
        (checkout / "private").mkdir()
        home = self.dir / "factory-home"
        home.symlink_to(checkout / "private")
        with patch.dict(os.environ, {"FACTORY_HOME": str(home)}):
            source = self.dir / "source.json"
            source.write_text(json.dumps(MINIMAL))
            with self.assertRaisesRegex(host_config.ConfigError, "outside every Git checkout"):
                host_config.import_manifest(source, host_config.default_manifest())
            self.assertFalse((checkout / "private/hosts.json").exists())

    def test_import_from_a_source_checkout_to_the_private_home(self):
        """The migration route: the source manifest sits in a checkout; the copy must not."""
        checkout = self.dir / "morpheus-factory"
        (checkout / ".git").mkdir(parents=True)
        source = checkout / "worker/updates.json"
        source.parent.mkdir()
        source.write_text(EXAMPLE.read_text())
        destination = self.dir / "home/.local/share/factory/hosts.json"
        host_config.import_manifest(source, destination)
        self.assertEqual(host_config.load(destination), json.loads(EXAMPLE.read_text()))
        with self.assertRaisesRegex(host_config.ConfigError, "outside every Git checkout"):
            host_config.load(source)

    def test_readers_never_resolve_a_link_before_the_check(self):
        real = self.write(MINIMAL)
        link = self.dir / "link.json"
        link.symlink_to(real)
        controller = load_module("update_controller", "worker/update_controller.py")
        with self.assertRaisesRegex(controller.UpdateError, "regular file"):
            controller.pin_for_host(link, "mini")
        fleet = load_module("fleet_controller", "fleet/controller.py")
        with self.assertRaisesRegex(fleet.FleetError, "regular file"):
            fleet.read_host(link, "mini")

    def test_schema_and_host_names_are_validated(self):
        for data, message in (({"hosts": MINIMAL["hosts"]}, "schemaVersion 1"), ({"schemaVersion": 2, "hosts": MINIMAL["hosts"]}, "schemaVersion 1"),
                              ({"schemaVersion": 1, "hosts": {}}, "non-empty"), ({"schemaVersion": 1, "hosts": []}, "non-empty"),
                              ({"schemaVersion": 1, "hosts": {"../x": {}}}, "plain identifiers"), ({"schemaVersion": 1, "hosts": {"mini": "x"}}, "plain identifiers")):
            self.write(data)
            self.refused(message)
        self.path.write_text("{not json")
        os.chmod(self.path, 0o600)
        self.refused("not valid JSON")

    def test_credential_values_are_refused_and_never_echoed(self):
        secrets = ["ghp_" + "a" * 36, "github_pat_" + "b" * 30, "sk-" + "c" * 32, "AKIA" + "D" * 16,
                   "-----BEGIN OPENSSH PRIVATE KEY-----", "xoxb-" + "1" * 20]
        for secret in secrets:
            self.write({**MINIMAL, "hosts": {"mini": {"apple": {"idVar": secret}}}})
            with self.assertRaises(host_config.ConfigError) as caught:
                host_config.load(self.path)
            self.assertIn("reference", str(caught.exception))
            self.assertNotIn(secret, str(caught.exception))
        # References are what the manifest is for.
        self.write({**MINIMAL, "hosts": {"mini": {"apple": {"idVar": "FACTORY_APPLE_ID"}, "keyRef": "env:FACTORY_KEY"}}})
        host_config.load(self.path)

    def test_missing_manifest_names_the_remedy_without_contents(self):
        errors = io.StringIO()
        with redirect_stderr(errors):
            self.assertEqual(host_config.main(["check", "--manifest", str(self.path)]), 78)
        self.assertIn("manifest not found", errors.getvalue())
        self.assertIn("host_config.py import", errors.getvalue())

    def test_default_location_is_the_factory_home(self):
        with patch.dict(os.environ, {"FACTORY_HOME": "/srv/factory"}):
            self.assertEqual(host_config.default_manifest(), Path("/srv/factory/hosts.json"))
        with patch.dict(os.environ, {}, clear=True), patch.object(host_config.Path, "home", return_value=Path("/h")):
            self.assertEqual(host_config.default_manifest(), Path("/h/.local/share/factory/hosts.json"))

    def test_import_is_exclusive_private_and_never_overwrites(self):
        source = self.dir / "source.json"
        source.write_text(json.dumps(MINIMAL))
        os.chmod(source, 0o644)  # an existing checkout copy is often world-readable
        destination = self.dir / "home/factory/hosts.json"
        with redirect_stdout(io.StringIO()):
            self.assertEqual(host_config.main(["import", "--from", str(source), "--manifest", str(destination)]), 0)
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        self.assertEqual(destination.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(json.loads(destination.read_text()), MINIMAL)
        destination.write_text('{"kept": true}')
        errors = io.StringIO()
        with redirect_stderr(errors):
            self.assertEqual(host_config.main(["import", "--from", str(source), "--manifest", str(destination)]), 78)
        self.assertIn("already exists", errors.getvalue())
        self.assertEqual(destination.read_text(), '{"kept": true}')

    def test_import_refuses_a_link_at_the_destination(self):
        source = self.dir / "source.json"
        source.write_text(json.dumps(MINIMAL))
        elsewhere = self.dir / "elsewhere.json"
        (self.dir / "hosts.json").symlink_to(elsewhere)
        with self.assertRaises(host_config.ConfigError):
            host_config.import_manifest(source, self.dir / "hosts.json")
        self.assertFalse(elsewhere.exists())

    def test_field_prints_one_string(self):
        manifest = self.dir / "copy.json"
        write_private(manifest, EXAMPLE.read_text())
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(host_config.main(["field", "--manifest", str(manifest), "--host", "gate-mbp", "--path", "paths.credentialsProject"]), 0)
        self.assertEqual(output.getvalue(), "/Users/operator/code/example-app\n")
        with redirect_stderr(io.StringIO()):
            self.assertEqual(host_config.main(["field", "--manifest", str(manifest), "--host", "gate-mbp", "--path", "paths.hostSetup"]), 78)

    def test_example_manifest_is_valid_once_private(self):
        manifest = self.dir / "copy.json"
        write_private(manifest, EXAMPLE.read_text())
        self.assertEqual(sorted(host_config.load(manifest)["hosts"]), ["ci-mini", "gate-mbp"])


class UpdateRunnerTests(unittest.TestCase):
    """The hourly runner validates the private manifest before anything else and never fetches its own code."""

    def run_runner(self, manifest, *extra):
        return subprocess.run(["bash", str(ROOT / "worker/update_runner.sh"), "--host", "ci-mini", "--manifest", str(manifest),
                               "--github-user", "example-agent", *extra], capture_output=True, text=True,
                              env={"PATH": "/usr/bin:/bin", "HOME": "/nonexistent"})

    def test_group_readable_manifest_stops_with_configuration_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory).resolve() / "hosts.json"
            manifest.write_text(EXAMPLE.read_text())
            os.chmod(manifest, 0o644)
            result = self.run_runner(manifest)
        self.assertEqual(result.returncode, 78)
        self.assertIn("chmod 600", result.stderr)

    def test_github_user_is_required(self):
        result = subprocess.run(["bash", str(ROOT / "worker/update_runner.sh"), "--host", "ci-mini", "--manifest", "/x/hosts.json"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)

    def test_runner_has_no_self_update_or_personal_default(self):
        text = (ROOT / "worker/update_runner.sh").read_text()
        self.assertNotIn("git -C", text)
        self.assertNotIn("merge --ff-only", text)
        self.assertIn('github_user=""', text)


if __name__ == "__main__":
    unittest.main()
