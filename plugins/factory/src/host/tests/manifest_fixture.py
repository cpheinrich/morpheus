"""Private-manifest helpers: every manifest a test writes is owner-only, as host_config requires."""

import os
import shutil
import tempfile
from pathlib import Path

EXAMPLE = Path(__file__).resolve().parents[1] / "examples/hosts.example.json"


def write_private(path, text):
    Path(path).write_text(text)
    os.chmod(path, 0o600)


def example_manifest(test):
    """A private copy of the synthetic example manifest, removed after `test`."""
    directory = tempfile.TemporaryDirectory()
    test.addCleanup(directory.cleanup)
    path = Path(directory.name).resolve() / "hosts.json"
    shutil.copyfile(EXAMPLE, path)
    os.chmod(path, 0o600)
    return path
