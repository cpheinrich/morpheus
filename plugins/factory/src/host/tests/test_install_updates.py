import importlib.util
import io
import json
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stderr, redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from manifest_fixture import example_manifest


SCRIPT = Path(__file__).resolve().parents[1] / "worker/install_updates.py"
spec = importlib.util.spec_from_file_location("install_updates", SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

HEALTHY = SimpleNamespace(returncode=0, stdout=json.dumps({"ok": True, "checks": [{"name": "sudo", "ok": True, "detail": "allowed"}]}), stderr="")
FAILED = SimpleNamespace(returncode=1, stdout=json.dumps({"ok": False, "checks": [
    {"name": "sudo", "ok": False, "blocking": True, "detail": "helper missing"}, {"name": "device", "ok": False, "blocking": False, "detail": "phone is unavailable"}]}), stderr="")
# Only informational checks fail: the install proceeds and warns.
INFORMATIONAL = SimpleNamespace(returncode=1, stdout=json.dumps({"ok": False, "checks": [
    {"name": "sudo", "ok": True, "blocking": True, "detail": "allowed"}, {"name": "runner-groups", "ok": False, "blocking": False, "detail": "403 reading groups"}]}), stderr="")


class InstallUpdatesTests(unittest.TestCase):
    def setUp(self):
        self.manifest = example_manifest(self)
    def test_host_github_account_reaches_plist_and_bootstrap_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            project = home / "host-credentials"
            project.mkdir()
            commands = []
            bootstrap_attempts = 0

            def command(argv, **kwargs):
                nonlocal bootstrap_attempts
                commands.append(argv)
                if argv[:2] == ["launchctl", "bootstrap"]:
                    bootstrap_attempts += 1
                    return SimpleNamespace(returncode=0 if bootstrap_attempts == 3 else 5)
                return HEALTHY

            argv = ["install_updates.py", "--host", "ci-mini", "--manifest", str(self.manifest), "--credentials-project", str(project), "--github-user", "example-agent"]
            with patch.object(sys, "argv", argv), patch.object(installer.Path, "home", return_value=home), \
                 patch.object(installer.subprocess, "run", side_effect=command), patch.object(installer.time, "sleep") as sleep:
                installer.main()
            plist = plistlib.loads((home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist").read_bytes())
            args = plist["ProgramArguments"]
            self.assertEqual(args[args.index("--github-user") + 1], "example-agent")
            self.assertEqual(args[args.index("--credentials-project") + 1], str(project.resolve()))
            self.assertEqual(bootstrap_attempts, 3)
            self.assertEqual(sleep.call_count, 2)
            self.assertTrue(any(command[:2] == ["plutil", "-lint"] for command in commands))

    def test_invalid_plist_does_not_replace_installed_job(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            project = home / "host-credentials"
            project.mkdir()
            target = home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"old installed plist")
            commands = []

            def command(argv, **kwargs):
                commands.append(argv)
                if argv[:2] == ["plutil", "-lint"]:
                    raise subprocess.CalledProcessError(1, argv)
                return HEALTHY

            argv = ["install_updates.py", "--host", "ci-mini", "--manifest", str(self.manifest), "--credentials-project", str(project), "--github-user", "example-agent"]
            with patch.object(sys, "argv", argv), patch.object(installer.Path, "home", return_value=home), \
                 patch.object(installer.subprocess, "run", side_effect=command):
                with self.assertRaises(subprocess.CalledProcessError):
                    installer.main()
            self.assertEqual(target.read_bytes(), b"old installed plist")
            self.assertFalse(any(args[:2] == ["launchctl", "bootout"] for args in commands))


    def run_installer(self, argv, result, home):
        commands = []

        def command(args, **kwargs):
            commands.append((args, kwargs))
            if "check" in args:
                return result
            return SimpleNamespace(returncode=0, stdout="")

        if "--manifest" not in argv:
            argv = [*argv, "--manifest", str(self.manifest)]
        if "--check" not in argv and "--github-user" not in argv and "--rollback" not in argv:
            argv = [*argv, "--github-user", "example-agent"]
        output = io.StringIO()
        with patch.object(sys, "argv", ["install_updates.py", *argv]), patch.object(installer.Path, "home", return_value=home), \
             patch.object(installer.subprocess, "run", side_effect=command), patch.object(installer.time, "sleep"), \
             redirect_stdout(output):
            try:
                installer.main()
                code = 0
            except SystemExit as error:
                code = error.code
        return code, output.getvalue(), commands

    def test_check_exits_nonzero_when_host_check_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            project = home / "credentials"
            project.mkdir()
            code, output, commands = self.run_installer(["--check", "--host", "ci-mini", "--credentials-project", str(project)], FAILED, home)
            self.assertEqual(code, 1)
            self.assertIn("device: WARN - phone is unavailable", output)
            self.assertIn("sudo: FAIL - helper missing", output)
            check, kwargs = commands[0]
            self.assertEqual(check[:4], ["morpheus", "credentials", "run", "--"])
            self.assertEqual(check[-6:], ["check", "--host", "ci-mini", "--manifest", str(self.manifest), "--json"])
            self.assertEqual(kwargs["cwd"], project)
            code, _, _ = self.run_installer(["--check", "--host", "ci-mini", "--credentials-project", str(project)], HEALTHY, home)
            self.assertEqual(code, 0)

    def test_unparseable_check_is_a_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            broken = SimpleNamespace(returncode=1, stdout="", stderr="update-controller: host nobody has no Xcode pin\n")
            code, output, _ = self.run_installer(["--check", "--host", "ci-mini", "--credentials-project", directory], broken, home)
            self.assertEqual(code, 1)
            self.assertIn("check: FAIL - update-controller: host nobody has no Xcode pin", output)

    def test_install_refuses_when_host_check_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            code, _, commands = self.run_installer(["--host", "ci-mini", "--credentials-project", directory], FAILED, home)
            self.assertEqual(code, 1)
            self.assertFalse((home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist").exists())
            self.assertFalse(any(args[0] == "launchctl" for args, _ in commands))

    def test_install_warns_but_proceeds_on_informational_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            code, output, commands = self.run_installer(["--host", "ci-mini", "--credentials-project", directory], INFORMATIONAL, home)
            self.assertEqual(code, 0)
            self.assertIn("warning: runner-groups: 403 reading groups", output)
            self.assertTrue((home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist").exists())

    def test_credentials_project_defaults_to_manifest_path(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            project = home / "example-app"
            project.mkdir()
            pin = SimpleNamespace(paths={"credentialsProject": str(project)})
            controller = SimpleNamespace(pin_for_host=lambda manifest, host: pin)
            with patch.object(installer, "load_controller", return_value=controller):
                code, _, commands = self.run_installer(["--host", "gate-mbp"], HEALTHY, home)
            self.assertEqual(code, 0)
            self.assertEqual(commands[0][1]["cwd"], project)
            plist = plistlib.loads((home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist").read_bytes())
            args = plist["ProgramArguments"]
            self.assertEqual(args[args.index("--credentials-project") + 1], str(project.resolve()))

    def test_example_manifest_supplies_each_hosts_credentials_project(self):
        controller = installer.load_controller(installer.Path(SCRIPT).resolve().parents[1])
        self.assertEqual(controller.pin_for_host(self.manifest, "gate-mbp").paths["credentialsProject"], "/Users/operator/code/example-app")
        self.assertEqual(controller.pin_for_host(self.manifest, "ci-mini").paths["credentialsProject"], "/Users/operator/code/example-app")

    def test_missing_default_credentials_project_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            pin = SimpleNamespace(paths={"credentialsProject": str(Path(directory) / "absent")})
            with patch.object(installer, "load_controller", return_value=SimpleNamespace(pin_for_host=lambda m, h: pin)), \
                 redirect_stderr(io.StringIO()):
                code, _, commands = self.run_installer(["--check", "--host", "gate-mbp"], HEALTHY, Path(directory))
            self.assertEqual(code, 2)
            self.assertEqual(commands, [])


class ServiceMigrationTests(unittest.TestCase):
    """Moving the LaunchAgent from a source checkout to the installed package, and back."""

    def setUp(self):
        self.manifest = example_manifest(self)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name).resolve()
        self.project = self.home / "credentials"
        self.project.mkdir()
        self.target = self.home / "Library/LaunchAgents/com.morpheus-factory.host-updates.plist"
        self.running = False
        self.commands = []

    def command(self, argv, **kwargs):
        self.commands.append(argv)
        if argv[:2] == ["launchctl", "print"]:
            return SimpleNamespace(returncode=0, stdout="\tstate = running\n\tpid = 4242\n" if self.running else "\tstate = not running\n")
        return HEALTHY

    def invoke(self, *argv):
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", ["install_updates.py", *argv]), patch.object(installer.Path, "home", return_value=self.home), \
             patch.object(installer.subprocess, "run", side_effect=self.command), patch.object(installer.time, "sleep"), \
             redirect_stdout(output), redirect_stderr(errors):
            try:
                installer.main()
                return 0, output.getvalue() + errors.getvalue()
            except SystemExit as error:
                return error.code, output.getvalue() + errors.getvalue()

    def install(self):
        return self.invoke("--host", "ci-mini", "--manifest", str(self.manifest), "--credentials-project", str(self.project),
                        "--github-user", "example-agent")

    def test_source_service_moves_to_this_package_and_rolls_back(self):
        self.target.parent.mkdir(parents=True)
        source_service = plistlib.dumps({"Label": installer.LABEL, "ProgramArguments": ["/bin/bash", "/Users/operator/code/morpheus-factory/worker/update_runner.sh"]})
        self.target.write_bytes(source_service)
        code, _ = self.install()
        self.assertEqual(code, 0)
        args = plistlib.loads(self.target.read_bytes())["ProgramArguments"]
        package = SCRIPT.resolve().parents[1]
        self.assertEqual(args[1], str(package / "worker/update_runner.sh"))
        self.assertEqual(args[args.index("--manifest") + 1], str(self.manifest))
        previous = self.target.with_name(self.target.name + ".previous")
        self.assertEqual(previous.read_bytes(), source_service)
        self.assertEqual(previous.stat().st_mode & 0o777, 0o600)
        self.commands.clear()
        code, output = self.invoke("--rollback")
        self.assertEqual(code, 0, output)
        self.assertEqual(self.target.read_bytes(), source_service)
        self.assertFalse(previous.exists())
        self.assertIn(["launchctl", "bootstrap", f"gui/{installer.os.getuid()}", str(self.target)], self.commands)

    def test_reinstalling_the_same_service_keeps_the_real_previous(self):
        self.assertEqual(self.install()[0], 0)
        self.assertFalse(self.target.with_name(self.target.name + ".previous").exists())
        self.assertEqual(self.install()[0], 0)
        self.assertFalse(self.target.with_name(self.target.name + ".previous").exists())

    def test_a_running_tick_is_never_replaced_or_rolled_back(self):
        self.target.parent.mkdir(parents=True)
        self.target.write_bytes(b"source service")
        self.target.with_name(self.target.name + ".previous").write_bytes(b"older service")
        self.running = True
        for argv in (None, ("--rollback",)):
            self.commands.clear()
            code, output = self.install() if argv is None else self.invoke(*argv)
            self.assertEqual(code, 75, output)
            self.assertIn("job is running", output)
            self.assertEqual(self.target.read_bytes(), b"source service")
            self.assertFalse(any(c[:2] in (["launchctl", "bootout"], ["launchctl", "bootstrap"]) for c in self.commands))

    def test_rollback_without_a_previous_service_is_a_configuration_error(self):
        code, output = self.invoke("--rollback")
        self.assertEqual(code, 78)
        self.assertIn("no previous LaunchAgent", output)

    def test_github_user_has_no_personal_default(self):
        code, output = self.invoke("--host", "ci-mini", "--manifest", str(self.manifest), "--credentials-project", str(self.project))
        self.assertEqual(code, 2)
        self.assertIn("GitHub user", output)
        self.assertFalse(self.target.exists())

    def test_a_group_readable_or_missing_manifest_is_refused_before_any_command(self):
        installer.os.chmod(self.manifest, 0o644)
        code, output = self.install()
        self.assertEqual(code, 2)
        self.assertIn("chmod 600", output)
        self.assertEqual(self.commands, [])
        code, output = self.invoke("--host", "ci-mini", "--manifest", str(self.home / "absent.json"), "--github-user", "example-agent")
        self.assertEqual(code, 2)
        self.assertIn("manifest not found", output)
        self.assertEqual(self.commands, [])


if __name__ == "__main__":
    unittest.main()
