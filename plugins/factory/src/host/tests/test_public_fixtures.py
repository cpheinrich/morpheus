"""This package is public. Its fixtures, examples and docs use synthetic identities only.

The guard matches the *shape* of personal metadata, never a list of real values: a denylist
of real hostnames, paths or device ids would itself publish them.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git"}
SKIP_FILES = {"pnpm-lock.yaml"}
ALLOWED_EMAIL_DOMAINS = {"example.com", "example.org", "example.net", "example.test", "example.invalid", "sub2api.local"}

SHAPES = {
    "home directory": re.compile(r"/Users/(?!(?:operator|worker|Shared)\b)[A-Za-z0-9._-]+"),
    "device UDID": re.compile(r"\b(?!0{8}-?0{15})[0-9A-F]{8}-?[0-9A-F]{16}\b"),
    "tailnet name": re.compile(r"\btail[0-9a-f]{4,}\.ts\.net\b"),
    "tailnet address": re.compile(r"\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}\b"),
    "runner label": re.compile(r"\bactions\.runner\.(?!example-org\.)[A-Za-z0-9-]+"),
    # Signing certificates name a person and an organization; fixtures use the synthetic ones.
    "certificate subject": re.compile(r"\b(?:Apple|iPhone|Mac) (?:Development|Distribution|Developer ID [A-Za-z]+): "
                                      r"(?!(?:Operator|Example Operator|operator@example\.test) \()[^(\n\"]+\("),
}
# Apple team and certificate user ids: ten characters, in parentheses, an OU or a "team" field.
ORGANIZATION = re.compile(r"(?:organizationName|\bO)\s*=\s*([^\n,\\]+)")
SYNTHETIC_ORGANIZATIONS = {"Example Org LLC.", "Example Org LLC", "Example Operator"}
SYNTHETIC_IDS = {"ABCDE12345", "AAAAA11111", "BBBBB22222", "CCCCC33333"}
APPLE_ID = re.compile(r'\(([A-Z0-9]{10})\)|organizationalUnitName\s*=\s*([A-Z0-9]{10})\b|"team"\s*:\s*"([A-Z0-9]{10})"|\bUID\s*=\s*([A-Z0-9]{10})\b|\buserId\s*=\s*([A-Z0-9]{10})\b')
# Device and devicectl identifiers: a UUID is synthetic only when each group repeats one
# character, or it is all zeros but the last digit.
UUID = re.compile(r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b")


def synthetic_uuid(value):
    groups = value.split("-")
    return all(len(set(group)) == 1 for group in groups) or set(value.replace("-", "")[:-1]) == {"0"}
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b")


def findings(text):
    found = [(name, match.group(0)) for name, shape in SHAPES.items() for match in shape.finditer(text)]
    for match in APPLE_ID.finditer(text):
        value = next(group for group in match.groups() if group)
        if value not in SYNTHETIC_IDS and re.search(r"[0-9]", value) and re.search(r"[A-Z]", value):
            found.append(("Apple team or certificate id", value))
    for match in UUID.finditer(text):
        if not synthetic_uuid(match.group(0)):
            found.append(("device identifier", match.group(0)))
    for match in ORGANIZATION.finditer(text):
        if match.group(1).strip() not in SYNTHETIC_ORGANIZATIONS:
            found.append(("certificate organization", match.group(1).strip()))
    for match in EMAIL.finditer(text):
        domain = match.group(1).lower()
        if domain not in ALLOWED_EMAIL_DOMAINS and not domain.endswith("noreply.github.com") and domain != "github.com":
            found.append(("email address", match.group(0)))
    return found


def package_files():
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and path != Path(__file__).resolve() and not SKIP_DIRS.intersection(path.relative_to(ROOT).parts) and path.name not in SKIP_FILES:
            yield path


class PublicFixtureTests(unittest.TestCase):
    def test_package_carries_no_personal_metadata(self):
        offenders = []
        for path in package_files():
            try:
                text = path.read_text()
            except UnicodeDecodeError:
                continue
            offenders += [f"{path.relative_to(ROOT)}: {name}" for name, _ in findings(text)]
        self.assertEqual(offenders, [])

    def test_guard_catches_each_shape(self):
        # Invented values in the real shapes; each must be caught, and the synthetic ones must not.
        caught = {name for name, _ in findings(
            "/Users/alice/code 1A2B3C4D-5E6F7A8B9C0D1E2F node7.tail0abc12.ts.net 100.101.102.103 "
            "actions.runner.acme.build-box \"team\": \"Q1W2E3R4T5\" alice@personal-mail.dev "
            "Apple Development: Alice Example (Z9Y8X7W6V5)\n    organizationName          = Acme Widgets Inc\n")}
        self.assertEqual(caught, {*SHAPES, "email address", "Apple team or certificate id", "certificate organization"})
        # Each id shape on its own: a certificate userId and a devicectl identifier.
        self.assertEqual(findings("    userId                    = Q9W8E7R6T5\n"), [("Apple team or certificate id", "Q9W8E7R6T5")])
        self.assertEqual(findings('"identifier": "4B1C9E2D-7A3F-4E6B-9C8D-2F5A1B3C4D5E"'),
                         [("device identifier", "4B1C9E2D-7A3F-4E6B-9C8D-2F5A1B3C4D5E")])
        self.assertEqual(findings("/Users/operator/code 00000000-000000000000000E actions.runner.example-org.x "
                                  "\"team\": \"ABCDE12345\" operator@example.test noreply@github.com 10.0.0.1 "
                                  "Apple Development: Example Operator (AAAAA11111)\n    organizationName          = Example Org LLC.\n"
                                  "    userId                    = AAAAA11111\n 00000000-0000-0000-0000-00000000000E "
                                  "11111111-2222-3333-4444-555555555555"), [])

    def test_private_manifest_is_not_in_the_package(self):
        names = {path.name for path in package_files()}
        self.assertNotIn("hosts.json", names)
        self.assertNotIn("updates.json", names)
        self.assertNotIn("factory.json", names)


if __name__ == "__main__":
    unittest.main()
