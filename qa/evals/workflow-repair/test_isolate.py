import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from isolate import wrapper


class WrapperTests(unittest.TestCase):
    def test_subcommand_gets_overrides_and_exec_alone_ignores_user_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            native = root / "native cli"
            native.write_text("#!/usr/bin/python3\nimport sys,json\nprint(json.dumps(sys.argv[1:]))\n")
            native.chmod(0o700)
            profile = root / "profile"
            profile.write_text(wrapper(str(native), ["codebase-memory-mcp"]))
            profile.chmod(0o700)
            for command in ["exec", "app-server"]:
                result = subprocess.run([str(profile), command, "--json"], capture_output=True, text=True, check=True)
                args = json.loads(result.stdout)
                self.assertEqual(args[0], command)
                self.assertEqual(args[1:3], ["-c", "mcp_servers.codebase-memory-mcp.enabled=false"])
                self.assertIn('mcp_servers.codebase-memory-mcp.command="/usr/bin/false"', args)
                self.assertIn("features.apps=false", args)
                self.assertEqual("--ignore-user-config" in args, command == "exec")
                self.assertEqual(args[-1], "--json")

    def test_rejects_relative_binary_and_ambiguous_server_paths(self):
        with self.assertRaisesRegex(ValueError, "absolute"):
            wrapper("codex", [])
        with self.assertRaisesRegex(ValueError, "server name"):
            wrapper("/native/codex", ["server.with.dot"])
