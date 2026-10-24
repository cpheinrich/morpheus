#!/usr/bin/env python3
"""Operator-only, pinned upstream auth migration. All snapshots and credentials stay private.

stage is read-only against the service; apply/restore/bootstrap require --apply --drained.
Never run this from a model workspace or give its private directory to a worker.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request


def sha(data):
    return hashlib.sha256(data).hexdigest()


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)


def candidates(config, service, secret, public_url):
    config = json.loads(json.dumps(config))
    service = plistlib.loads(plistlib.dumps(service))
    config["server"].update(deploymentMode="authenticated", exposure="private", bind="loopback",
                            host="127.0.0.1", port=3100, allowedHostnames=["127.0.0.1", "localhost"])
    config["server"].pop("customBindHost", None)
    config.setdefault("auth", {}).update(baseUrlMode="explicit", publicBaseUrl=public_url, disableSignUp=False)
    service.setdefault("EnvironmentVariables", {}).update(
        BETTER_AUTH_SECRET=secret, PAPERCLIP_DEPLOYMENT_MODE="authenticated",
        PAPERCLIP_DEPLOYMENT_EXPOSURE="private", PAPERCLIP_BIND="loopback",
        PAPERCLIP_AUTH_BASE_URL_MODE="explicit", PAPERCLIP_AUTH_PUBLIC_BASE_URL=public_url,
        BETTER_AUTH_TRUSTED_ORIGINS=public_url,
        PAPERCLIP_AUTH_DISABLE_SIGN_UP="false", PAPERCLIP_ALLOWED_HOSTNAMES="127.0.0.1,localhost")
    return config, service


def http(path, *, cookie=None, body=None, origin=None):
    headers = {"Accept": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    if origin:
        headers["Origin"] = origin
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request("http://127.0.0.1:3100" + path,
                                    data=None if body is None else json.dumps(body).encode(), headers=headers)
    # No redirects: they could forward an owner session to a different destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
        return response.status, json.load(response), response.headers


def reload_service(plist_path, label):
    target = "gui/" + str(os.getuid())
    subprocess.run(["launchctl", "bootout", target + "/" + label], check=True, capture_output=True)
    # bootout can return before launchd releases the label. One bounded retry;
    # a second failure remains a stopped rollout requiring inspection.
    time.sleep(1)
    started = subprocess.run(["launchctl", "bootstrap", target, str(plist_path)], capture_output=True)
    if started.returncode:
        time.sleep(2)
        subprocess.run(["launchctl", "bootstrap", target, str(plist_path)], check=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["stage", "apply", "restore", "bootstrap", "claim-migrated", "resume-claim-migrated"])
    parser.add_argument("--private-dir", required=True)
    parser.add_argument("--config")
    parser.add_argument("--plist")
    parser.add_argument("--public-url", default="http://127.0.0.1:33100",
                        choices=["http://127.0.0.1:33100", "http://127.0.0.1:3100"])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--drained", action="store_true", help="operator has paused agents and proved empty slots/reservations/runs")
    parser.add_argument("--signup-rejected-before-create", action="store_true",
                        help="operator proved prior signup was rejected before handler execution; reuse exact saved identity")
    args = parser.parse_args()
    private = Path(args.private_dir).expanduser().resolve()
    workspace = Path(__file__).resolve().parents[2]
    if private == workspace or workspace in private.parents:
        raise ValueError("private directory must be outside the source workspace")
    if args.command == "stage":
        config_path, plist_path = Path(args.config).expanduser().resolve(), Path(args.plist).expanduser().resolve()
        raw_config, raw_plist = config_path.read_bytes(), plist_path.read_bytes()
        service = plistlib.loads(raw_plist)
        if service["Label"] != "ing.paperclip.paperclipai":
            raise ValueError("unexpected service label")
        if service["ProgramArguments"][1:] != ["run", "--instance", "default"]:
            raise ValueError("unexpected service launch command")
        config, service = candidates(json.loads(raw_config), service, secrets.token_urlsafe(48), args.public_url)
        private.mkdir(mode=0o700)  # Refuse reuse: backups cannot silently be overwritten.
        private_write(private / "config.before.json", raw_config)
        private_write(private / "service.before.plist", raw_plist)
        private_write(private / "config.candidate.json", (json.dumps(config, indent=2) + "\n").encode())
        private_write(private / "service.candidate.plist", plistlib.dumps(service))
        manifest = {"config": str(config_path), "plist": str(plist_path), "label": service["Label"],
                    "publicUrl": args.public_url, "before": [sha(raw_config), sha(raw_plist)]}
        private_write(private / "manifest.json", json.dumps(manifest).encode())
        print(json.dumps({"staged": True, "privateDirectory": str(private), "port": 3100, "dashboardOrigin": args.public_url}))
        return
    if not args.apply or not args.drained:
        raise ValueError("--apply --drained required after operator pause/drain proof")
    if private.stat().st_mode & 0o077:
        raise ValueError("private directory permissions must be 700")
    manifest = json.loads((private / "manifest.json").read_text())
    config_path, plist_path = Path(manifest["config"]), Path(manifest["plist"])
    if args.command in ["apply", "restore"]:
        suffix = "candidate" if args.command == "apply" else "before"
        if args.command == "apply" and [sha(config_path.read_bytes()), sha(plist_path.read_bytes())] != manifest["before"]:
            raise ValueError("live configuration changed since staging")
        if args.command == "restore" and not (private / "applied").exists():
            raise ValueError("no applied rollout to restore")
        for target, source in [(config_path, private / ("config." + suffix + ".json")),
                               (plist_path, private / ("service." + suffix + ".plist"))]:
            os.chmod(target, 0o600)
            target.write_bytes(source.read_bytes())
        if args.command == "apply":
            private_write(private / "applied", b"configuration written; inspect service if reload fails\n")
        reload_service(plist_path, manifest["label"])
        print(json.dumps({"configuration": suffix, "serviceReloaded": True, "workersMustRemainPaused": True}))
        return
    # A local operator identity is distinct from provider logins and sends no email.
    # Each network mutation is journaled first. An uncertain response requires inspection, never an automatic rerun.
    service = plistlib.loads(plist_path.read_bytes())
    if not (private / "applied").exists() or json.loads(config_path.read_text())["server"]["deploymentMode"] != "authenticated":
        raise ValueError("apply authenticated configuration before owner bootstrap")
    resuming = args.command == "resume-claim-migrated"
    migrated = args.command in ["claim-migrated", "resume-claim-migrated"]
    if resuming and ((private / "owner-session.private").exists() or (private / "board-key.private.json").exists()):
        raise ValueError("a later owner step may have happened; inspect its exact outcome instead of replaying")
    if args.signup_rejected_before_create and not resuming:
        raise ValueError("rejected-signup attestation applies only to explicit resume")
    if migrated:
        private_write(private / ("claim-migrated-resume-started" if resuming else "claim-migrated-started"), b"inspect before any repeat\n")
        log = Path(service["StandardOutPath"]).read_bytes()[-1024 * 1024:]
        challenges = re.findall(rb"/board-claim/([a-f0-9]{48})\?code=([a-f0-9]{24})", log)
        if not challenges:
            raise ValueError("no native migrated-board claim challenge in private service log")
        claim_token, claim_code = (part.decode() for part in challenges[-1])
        _, challenge, _ = http("/api/board-claim/" + claim_token + "?code=" + claim_code)
        if challenge.get("status") != "available" or challenge.get("requiresSignIn") is not True:
            raise ValueError("native migrated-board challenge is not available; do not force bootstrap")
        private_write(private / ("board-claim-resume.private.json" if resuming else "board-claim.private.json"), json.dumps({"token": claim_token, "code": claim_code}).encode())
    else:
        private_write(private / "owner-started", b"inspect before any repeat\n")
        env = dict(os.environ, **service["EnvironmentVariables"])
        output = subprocess.run([service["ProgramArguments"][0], "auth", "bootstrap-ceo", "--config", str(config_path),
                                 "--base-url", manifest["publicUrl"], "--expires-hours", "1"],
                                env=env, capture_output=True, check=True, timeout=30)
        private_write(private / "bootstrap-output.private", output.stdout + output.stderr)
        match = re.search(rb"pcp_bootstrap_[a-f0-9]+", output.stdout + output.stderr)
        if not match:
            raise ValueError("no bootstrap invite; an existing owner may already be present")
    if resuming:
        credentials = json.loads((private / "owner-credentials.private.json").read_text())
    else:
        credentials = {"name": "Morpheus local operator", "email": "morpheus-operator-" + secrets.token_hex(6) + "@localhost.invalid",
                       "password": secrets.token_urlsafe(36)}
        private_write(private / "owner-credentials.private.json", json.dumps(credentials).encode())
    signing_in = resuming and not args.signup_rejected_before_create
    auth_body = {key: credentials[key] for key in ["email", "password"]} if signing_in else credentials
    _, _, headers = http("/api/auth/sign-in/email" if signing_in else "/api/auth/sign-up/email", body=auth_body, origin=manifest["publicUrl"])
    cookie = "; ".join(value.split(";", 1)[0] for value in headers.get_all("Set-Cookie", []))
    if not cookie:
        raise ValueError("owner signup did not return a session")
    private_write(private / ("owner-session-resume.private" if resuming else "owner-session.private"), cookie.encode())
    if migrated:
        code, accepted, _ = http("/api/board-claim/" + claim_token + "/claim", body={"code": claim_code},
                                 cookie=cookie, origin="http://127.0.0.1:3100")
        confirmed = code == 200 and accepted.get("claimed") is True
    else:
        code, accepted, _ = http("/api/invites/" + match.group().decode() + "/accept", body={"requestType": "human"},
                                 cookie=cookie, origin="http://127.0.0.1:3100")
        confirmed = code == 202 and accepted.get("bootstrapAccepted") is True
    if not confirmed:
        raise ValueError("native owner acceptance not confirmed")
    code, board_key, _ = http("/api/board-api-keys", body={"name": "morpheus-local-operator"}, cookie=cookie,
                              origin="http://127.0.0.1:3100")
    if code != 201 or not board_key.get("token"):
        raise ValueError("board key creation not confirmed; inspect private session")
    private_write(private / "board-key.private.json", json.dumps(board_key).encode())
    # Close signup after the first owner is established, persistently across service restarts.
    config = json.loads(config_path.read_text())
    config["auth"]["disableSignUp"] = True
    service["EnvironmentVariables"]["PAPERCLIP_AUTH_DISABLE_SIGN_UP"] = "true"
    config_path.write_text(json.dumps(config, indent=2) + "\n")
    plist_path.write_bytes(plistlib.dumps(service))
    reload_service(plist_path, manifest["label"])
    print(json.dumps({"ownerCreated": True, "signupDisabled": True, "credentialsDirectory": str(private), "workersMustRemainPaused": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Subprocess and HTTP errors may carry invite URLs or credentials.
        print("Auth rollout stopped (" + type(error).__name__ + "); inspect private artifacts and current service before retry.", file=sys.stderr)
        sys.exit(1)
