"""Generate best-effort native tool restrictions without copying login material.

This is not a complete capability boundary: hosted delegation remained callable
on 0.163.0 despite these settings. Do not use it to qualify unattended workers.
"""
import argparse
from pathlib import Path
import re
import shlex


def wrapper(native, servers):
    if not Path(native).is_absolute():
        raise ValueError("native CLI path must be absolute")
    flags = []
    for name in servers:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            raise ValueError("unsupported MCP server name")
        for key, value in [("enabled", "false"), ("command", '"/usr/bin/false"'), ("args", "[]")]:
            flags += ["-c", "mcp_servers." + name + "." + key + "=" + value]
    for name, value in [("apps", "false"), ("plugins", "false"), ("remote_plugin", "false"),
                        ("hooks", "false"), ("skill_search", "false"),
                        ("skip_host_skill_discovery", "true"), ("skill_mcp_dependency_install", "false"),
                        ("code_mode_host", "false"), ("computer_use", "false"),
                        ("browser_use", "false"), ("browser_use_external", "false"),
                        ("in_app_browser", "false"), ("multi_agent", "false"),
                        ("multi_agent_v2", "false"), ("image_generation", "false"),
                        ("daemon_auto_start", "false")]:
        flags += ["-c", "features." + name + "=" + value]
    flags += ["-c", 'web_search="disabled"']
    command = shlex.quote(str(native))
    options = " ".join(shlex.quote(value) for value in flags)
    # On the probed 0.163 build, putting -c before the subcommand did not
    # constrain app-server/exec tools. Test actual subcommand behavior too.
    return ('#!/bin/sh\ncase "$1" in\n'
            ' exec) shift; exec ' + command + ' exec ' + options + ' --ignore-user-config "$@";;\n'
            ' app-server) shift; exec ' + command + ' app-server ' + options + ' "$@";;\n'
            ' *) exec ' + command + ' ' + options + ' "$@";;\nesac\n')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("native")
    parser.add_argument("output", type=Path)
    parser.add_argument("--server", action="append", default=[])
    args = parser.parse_args()
    with args.output.open("x") as handle:
        handle.write(wrapper(args.native, args.server))
    args.output.chmod(0o700)
