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


def accept():
    response = json.load(sys.stdin)
    if not isinstance(response, dict) or response.get("errors"):
        raise ValueError("Upload response does not confirm acceptance")
    data = response.get("data")
    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if not isinstance(data, dict) or data.get("errors") or data.get("state") == "FAILED":
        raise ValueError("Upload response does not confirm acceptance")
    upload_id = data.get("id")
    if not isinstance(upload_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", upload_id):
        raise ValueError("Upload response has no unambiguous upload id")
    directory = Path(os.environ["UPLOAD_RECEIPT_DIRECTORY"])
    raw_context = json.loads((directory / "context.json").read_text())
    context = {key: raw_context[key] for key in ("repository", "sourceSha", "runId", "runAttempt", "job")}
    receipt = dict(context, schemaVersion=1, state="accepted",
                   bundleId=checked("IOS_BUNDLE_ID", r"[A-Za-z0-9.-]+"),
                   appId=checked("ASC_APP_ID", r"[1-9][0-9]*"),
                   version=checked("MARKETING_VERSION", r"[0-9]+(?:\.[0-9]+){1,2}"),
                   buildNumber=checked("BUILD_NUMBER", r"[1-9][0-9]*"), uploadId=upload_id,
                   acceptedAt=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"))
    target = directory / "accepted.json"
    # fsync and link give atomic create-only publication; a retry cannot replace evidence.
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(receipt, stream, sort_keys=True, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, target)
    finally:
        os.unlink(temporary)
    outputs({"receipt-path": target, "upload-id": upload_id,
             "version": receipt["version"], "build-number": receipt["buildNumber"]})


if __name__ == "__main__":
    try:
        {"prepare": prepare, "accept": accept}[sys.argv[1]]()
    except (ValueError, KeyError, OSError) as error:
        # Parser errors can contain API response fragments; keep them out of public logs.
        print("Could not record upload acceptance (" + type(error).__name__ + "); outcome remains uncertain.", file=sys.stderr)
        sys.exit(1)
