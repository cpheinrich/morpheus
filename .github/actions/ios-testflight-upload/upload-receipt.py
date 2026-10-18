"""Allowlisted evidence of Apple's transport acceptance, independent of distribution."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def checked(name, pattern):
    value = os.environ.get(name, "")
    if not re.fullmatch(pattern, value):
        raise ValueError("Invalid receipt metadata: " + name)
    return value


def outputs(values):
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        for name, value in values.items():
            if "\n" in str(value) or "\r" in str(value):
                raise ValueError("Multiline receipt output refused")
            stream.write(f"{name}={value}\n")


def prepare():
    context = dict(
        repository=checked("GITHUB_REPOSITORY", r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"),
        runId=checked("GITHUB_RUN_ID", r"[1-9][0-9]*"),
        runAttempt=checked("GITHUB_RUN_ATTEMPT", r"[1-9][0-9]*"),
        job=checked("GITHUB_JOB", r"[A-Za-z_][A-Za-z0-9_-]*"),
    )
    context["sourceSha"] = subprocess.check_output(
        ["git", "-C", os.environ["GITHUB_WORKSPACE"], "rev-parse", "HEAD"], text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", context["sourceSha"]):
        raise ValueError("Invalid checked-out source SHA")
    directory = Path(tempfile.mkdtemp(prefix="ios-upload-acceptance-", dir=os.environ["RUNNER_TEMP"]))
    (directory / "context.json").write_text(json.dumps(context))
    # Unique per invocation as well as attempt: matrix jobs and two apps may share a job id.
    outputs({"directory": directory,
             "artifact-name": f"ios-upload-acceptance-{context['runId']}-{context['runAttempt']}-{directory.name.rsplit('-', 1)[-1]}"})


def upload_data(allow_unknown=False):
    response = json.load(sys.stdin)
    if not isinstance(response, dict) or (response.get("errors") and not allow_unknown):
        raise ValueError("Upload response does not confirm acceptance")
    data = response.get("data")
    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if not isinstance(data, dict):
        raise ValueError("Upload response has no resource")
    if not allow_unknown and data.get("state") not in {"AWAITING_UPLOAD", "PROCESSING", "COMPLETE", "FAILED", "INVALID"}:
        raise ValueError("Upload response does not confirm acceptance")
    if not allow_unknown and data.get("errors") and data["state"] not in {"FAILED", "INVALID"}:
        raise ValueError("Upload response contains errors")
    upload_id = data.get("id")
    if not isinstance(upload_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", upload_id):
        raise ValueError("Upload response has no unambiguous upload id")
    return data


def describe():
    data = upload_data()
    print(data["id"], data["state"])


def identity():
    directory = Path(os.environ["UPLOAD_RECEIPT_DIRECTORY"])
    raw_context = json.loads((directory / "context.json").read_text())
    context = {key: raw_context[key] for key in ("repository", "sourceSha", "runId", "runAttempt", "job")}
    receipt = dict(context, schemaVersion=1,
                   bundleId=checked("IOS_BUNDLE_ID", r"[A-Za-z0-9.-]+"),
                   appId=checked("ASC_APP_ID", r"[1-9][0-9]*"),
                   version=checked("MARKETING_VERSION", r"[0-9]+(?:\.[0-9]+){1,2}"),
                   buildNumber=checked("BUILD_NUMBER", r"[1-9][0-9]*"))
    if os.environ.get("IPA_SHA256"):
        receipt["ipaSha256"] = checked("IPA_SHA256", r"[0-9a-f]{64}")
    fields = dict(intentId="MORPHEUS_CD_INTENT_ID", attemptId="MORPHEUS_CD_ATTEMPT_ID",
                  dispatchEffectId="MORPHEUS_CD_DISPATCH_EFFECT_ID", controlSha="MORPHEUS_CD_CONTROL_SHA")
    if any(os.environ.get(name) for name in [*fields.values(), "MORPHEUS_CD_SOURCE_SHA"]):
        for key, name in fields.items():
            receipt[key] = checked(name, r"[0-9a-f]{40}" if key == "controlSha" else r"[A-Za-z0-9][A-Za-z0-9._:-]{0,199}")
        source = checked("MORPHEUS_CD_SOURCE_SHA", r"[0-9a-f]{40}")
        actual = subprocess.check_output(["git", "-C", os.environ["GITHUB_WORKSPACE"], "rev-parse", "HEAD"], text=True).strip()
        if source != context["sourceSha"] or source != actual:
            raise ValueError("CD source does not match checked-out source")
        receipt["ipaSha256"] = checked("IPA_SHA256", r"[0-9a-f]{64}")
        if context["runId"] != checked("GITHUB_RUN_ID", r"[1-9][0-9]*") or context["runAttempt"] != checked("GITHUB_RUN_ATTEMPT", r"[1-9][0-9]*"):
            raise ValueError("CD run does not match prepared context")
    return receipt


def validate():
    identity()


def publish(receipt, target, create_only):
    fd, temporary = tempfile.mkstemp(dir=target.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(receipt, stream, sort_keys=True, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        if create_only:
            os.link(temporary, target)
        else:
            os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def resource():
    data = upload_data(allow_unknown=True)
    expected_id = os.environ.get("EXPECTED_UPLOAD_ID", "")
    if expected_id and data["id"] != expected_id:
        raise ValueError("Upload confirmation id changed")
    state = data.get("state")
    if state not in {"AWAITING_UPLOAD", "PROCESSING", "COMPLETE", "FAILED", "INVALID"}:
        state = "UNKNOWN"
    receipt = dict(identity(), uploadId=data["id"], state=state)
    # Codes are useful terminal diagnostics; raw provider prose may contain
    # arbitrary data. Preserve only bounded machine codes from known fields.
    diagnostics = []
    errors = data.get("errors", [])
    if not isinstance(errors, list):
        errors = []
    for error in errors:
        if isinstance(error, dict):
            code = error.get("code")
            if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", code):
                diagnostics.append(code)
    if diagnostics:
        receipt["diagnosticCodes"] = diagnostics[:20]
    target = Path(os.environ["UPLOAD_RECEIPT_DIRECTORY"]) / "resource.json"
    publish(receipt, target, False)
    outputs({"resource-path": target})
    print(target)


def accept():
    data = upload_data()
    if data["state"] not in {"PROCESSING", "COMPLETE"}:
        raise ValueError("Upload transport acceptance is still uncertain")
    receipt = dict(identity(), state="accepted", uploadId=data["id"],
                   acceptedAt=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"))
    target = Path(os.environ["UPLOAD_RECEIPT_DIRECTORY"]) / "accepted.json"
    # Atomic create-only publication: a retry cannot replace accepted evidence.
    publish(receipt, target, True)
    outputs({"receipt-path": target, "upload-id": receipt["uploadId"],
             "version": receipt["version"], "build-number": receipt["buildNumber"]})


if __name__ == "__main__":
    try:
        {"prepare": prepare, "describe": describe, "accept": accept, "resource": resource, "validate": validate}[sys.argv[1]]()
    except (ValueError, KeyError, OSError) as error:
        # Parser errors can contain API response fragments; keep them out of public logs.
        print("Could not record upload acceptance (" + type(error).__name__ + "); outcome remains uncertain.", file=sys.stderr)
        sys.exit(1)
