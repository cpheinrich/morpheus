import importlib.util
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().parents[1] / ".github/actions/ios-testflight-upload/entitlements.py"
spec = importlib.util.spec_from_file_location("entitlements", TOOL)
entitlements = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entitlements)
HEALTH = "com.apple.developer.healthkit"


class EntitlementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.expected = self.root / "expected.plist"
        self.actual = self.root / "actual.plist"
        self.profile = self.root / "profile.plist"
        self.write(self.profile, {"Entitlements": {}})
        self.source = self.root / "App.entitlements"
        self.settings = self.root / "settings.json"
        self.values = {"PRODUCT_BUNDLE_IDENTIFIER": "med.example.app",
                       "WRAPPER_EXTENSION": "app", "SRCROOT": str(self.root),
                       "CODE_SIGN_ENTITLEMENTS": "App.entitlements",
                       "DEVELOPMENT_TEAM": "EXAMPLETEAM"}
        self.write(self.source, {HEALTH: True})

    def write(self, path, value):
        path.write_bytes(plistlib.dumps(value))

    def prepare(self):
        self.settings.write_text(json.dumps([{"buildSettings": self.values}]))
        entitlements.prepare(self.settings, "med.example.app", self.profile, self.expected)
        return plistlib.loads(self.expected.read_bytes())

    def test_healthkit_and_nested_values_survive_preparation(self):
        declared = {HEALTH: True, "groups": ["$(DEVELOPMENT_TEAM).example"],
                    "nested": {"value": "${DEVELOPMENT_TEAM}"}}
        self.write(self.source, declared)
        self.assertEqual(self.prepare(), {HEALTH: True, "groups": ["EXAMPLETEAM.example"],
                                         "nested": {"value": "EXAMPLETEAM"}})

    def test_missing_false_or_wrong_type_healthkit_is_rejected(self):
        self.prepare()
        for actual in ({}, {HEALTH: False}, {HEALTH: 1}, {HEALTH: "true"}):
            with self.subTest(actual=actual):
                self.write(self.actual, actual)
                with self.assertRaisesRegex(ValueError, HEALTH):
                    entitlements.verify(self.expected, self.actual)

    def test_export_may_add_distribution_identity(self):
        self.prepare()
        self.write(self.actual, {HEALTH: True, "application-identifier": "EXAMPLETEAM.med.example.app"})
        entitlements.verify(self.expected, self.actual)

    def test_distribution_environments_are_normalized_and_verified(self):
        cloud = "com.apple.developer.icloud-container-environment"
        self.write(self.source, {HEALTH: True, "aps-environment": "development", cloud: "Development"})
        self.write(self.profile, {"Entitlements": {"aps-environment": "production", cloud: ["Development", "Production"]}})
        expected = {HEALTH: True, "aps-environment": "production", cloud: "Production"}
        self.assertEqual(self.prepare(), expected)
        self.write(self.actual, expected)
        entitlements.verify(self.expected, self.actual)
        self.write(self.actual, {**expected, "aps-environment": "development"})
        with self.assertRaisesRegex(ValueError, "aps-environment"):
            entitlements.verify(self.expected, self.actual)

    def test_missing_or_development_only_profile_grant_fails(self):
        self.write(self.source, {"aps-environment": "development"})
        for grant in ({}, {"aps-environment": "development"}):
            with self.subTest(grant=grant):
                self.write(self.profile, {"Entitlements": grant})
                with self.assertRaisesRegex(ValueError, "Distribution profile"):
                    self.prepare()

    def test_missing_source_and_unresolved_variables_fail(self):
        self.source.unlink()
        with self.assertRaises(FileNotFoundError):
            self.prepare()
        self.write(self.source, {"groups": ["$(UNKNOWN).example"]})
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            self.prepare()

    def test_empty_configuration_is_supported(self):
        self.values["CODE_SIGN_ENTITLEMENTS"] = ""
        self.assertEqual(self.prepare(), {})

    def test_debugging_entitlement_is_rejected(self):
        self.write(self.source, {"get-task-allow": True})
        with self.assertRaisesRegex(ValueError, "get-task-allow"):
            self.prepare()

    def test_ambiguous_target_fails(self):
        self.settings.write_text(json.dumps([{"buildSettings": self.values}] * 2))
        with self.assertRaisesRegex(ValueError, "exactly one"):
            entitlements.prepare(self.settings, "med.example.app", self.profile, self.expected)

    @unittest.skipUnless(sys.platform == "darwin", "Requires Apple's codesign")
    def test_real_adhoc_signature_carries_healthkit(self):
        self.prepare()
        binary = self.root / "signed-fixture"
        shutil.copyfile("/usr/bin/true", binary)
        subprocess.run(["codesign", "--force", "--sign", "-", "--timestamp=none",
                        "--generate-entitlement-der", "--entitlements", str(self.expected),
                        str(binary)], check=True, capture_output=True)
        result = subprocess.run(["codesign", "-d", "--entitlements", ":-", str(binary)],
                                check=True, capture_output=True)
        self.actual.write_bytes(result.stdout)
        self.assertEqual(plistlib.loads(result.stdout)[HEALTH], True)
        entitlements.verify(self.expected, self.actual)


if __name__ == "__main__":
    unittest.main()
