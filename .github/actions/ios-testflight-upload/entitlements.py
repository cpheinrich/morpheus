#!/usr/bin/env python3
"""Carry the app's declared Release entitlements through an unsigned archive."""

import json
from pathlib import Path
import plistlib
import re
import sys


def prepare(settings_path, bundle_id, output_path):
    settings = json.loads(Path(settings_path).read_text())
    matches = [entry["buildSettings"] for entry in settings
               if entry.get("buildSettings", {}).get("PRODUCT_BUNDLE_IDENTIFIER") == bundle_id
               and entry["buildSettings"].get("WRAPPER_EXTENSION") == "app"]
    if len(matches) != 1:
        raise ValueError("Expected exactly one app target matching the release bundle identifier")
    values = matches[0]

    def expand(value):
        if isinstance(value, str):
            for _ in range(20):
                expanded = re.sub(r"\$\(([^)]+)\)|\$\{([^}]+)\}",
                                  lambda m: str(values.get(m[1] or m[2], m[0])), value)
                if expanded == value:
                    break
                value = expanded
            if "$(" in value or "${" in value:
                raise ValueError("Unresolved build setting in app entitlements")
            return value
        if isinstance(value, list):
            return [expand(item) for item in value]
        if isinstance(value, dict):
            return {key: expand(item) for key, item in value.items()}
        return value

    declared = {}
    source = values.get("CODE_SIGN_ENTITLEMENTS", "")
    if source:
        path = Path(expand(source))
        if not path.is_absolute():
            path = Path(values["SRCROOT"]) / path
        with path.open("rb") as stream:
            declared = expand(plistlib.load(stream))
    if not isinstance(declared, dict):
        raise ValueError("App entitlements must be a dictionary")
    if declared.get("get-task-allow", False) is not False:
        raise ValueError("Release app entitlements must not enable get-task-allow")
    with Path(output_path).open("wb") as stream:
        plistlib.dump(declared, stream)


def verify(expected_path, actual_path):
    with Path(expected_path).open("rb") as stream:
        expected = plistlib.load(stream)
    with Path(actual_path).open("rb") as stream:
        actual = plistlib.load(stream)
    if not isinstance(expected, dict) or not isinstance(actual, dict):
        raise ValueError("App entitlements must be dictionaries")
    # Export adds distribution identity entitlements. Every app-declared key
    # still has to survive unchanged; bool and integer are distinct plist types.
    for key, value in expected.items():
        if key not in actual or plistlib.dumps(actual[key]) != plistlib.dumps(value):
            raise ValueError(f"Exported app is missing or changed required entitlement: {key}")


if __name__ == "__main__":
    try:
        if sys.argv[1] == "prepare":
            prepare(*sys.argv[2:])
        elif sys.argv[1] == "verify":
            verify(*sys.argv[2:])
        else:
            raise ValueError("Expected prepare or verify")
    except (ValueError, OSError, KeyError, TypeError, plistlib.InvalidFileException) as error:
        sys.exit(str(error))
