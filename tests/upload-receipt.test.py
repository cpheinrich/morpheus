import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ACTION = Path(__file__).resolve().parents[1] / ".github/actions/ios-testflight-upload"
TOOL = ACTION / "upload-receipt.py"


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.output = self.root / "output"
        self.output.touch()
        self.env = dict(os.environ, RUNNER_TEMP=str(self.root), GITHUB_OUTPUT=str(self.output),
                        GITHUB_REPOSITORY="example/app", GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="1",
                        GITHUB_JOB="upload", GITHUB_WORKSPACE=str(self.root), GITHUB_REF="refs/heads/main",
                        IOS_BUNDLE_ID="com.example.app", ASC_APP_ID="123456", MARKETING_VERSION="1.2.3",
                        BUILD_NUMBER="42", ASC_API_KEY_P8_BASE64="SENTINEL_SECRET")
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=T", "-c", "user.email=t@example.com",
                        "commit", "--allow-empty", "-qm", "fixture"], check=True)
        (self.root / "app.ipa").write_bytes(b"verified signed IPA")
        self.sha = subprocess.check_output(["git", "-C", str(self.root), "rev-parse", "HEAD"], text=True).strip()

    def tool(self, mode, response=None, check=True):
        return subprocess.run(["python3", str(TOOL), mode], env=self.env,
                              input=json.dumps(response) if response is not None else "", text=True,
                              capture_output=True, check=check)

    def outputs(self):
        return dict(line.split("=", 1) for line in self.output.read_text().splitlines())

    def prepare(self):
        self.tool("prepare")
        self.env["UPLOAD_RECEIPT_DIRECTORY"] = self.outputs()["directory"]
        return Path(self.env["UPLOAD_RECEIPT_DIRECTORY"])

    def accept(self, response=None):
        self.tool("accept", response or {"data": [{"id": "12345678-1234-1234-1234-123456789abc", "state": "PROCESSING"}]})
        return Path(self.outputs()["receipt-path"])

    def test_preupload_failure_has_no_acceptance(self):
        directory = self.prepare()
        self.assertFalse((directory / "accepted.json").exists())
        self.assertNotIn("receipt-path", self.outputs())

    def test_exact_fields_are_sanitized(self):
        self.prepare()
        receipt = self.accept({"data": {"id": "12345678-1234-1234-1234-123456789abc", "state": "COMPLETE", "private": "SECRET_RESPONSE"}})
        data = json.loads(receipt.read_text())
        self.assertEqual(set(data), {"schemaVersion", "state", "repository", "sourceSha", "runId", "runAttempt", "job",
                                    "bundleId", "appId", "version", "buildNumber", "uploadId", "acceptedAt"})
        self.assertEqual({k: data[k] for k in ["schemaVersion", "state", "repository", "sourceSha", "runId", "runAttempt", "job", "bundleId", "appId", "version", "buildNumber", "uploadId"]},
                         dict(schemaVersion=1, state="accepted", repository="example/app", sourceSha=self.sha,
                              runId="123", runAttempt="1", job="upload", bundleId="com.example.app", appId="123456", version="1.2.3", buildNumber="42", uploadId="12345678-1234-1234-1234-123456789abc"))
        self.assertRegex(data["acceptedAt"], r"^\d{4}-\d\d-\d\dT.*Z$")
        self.assertNotIn("SECRET", receipt.read_text() + self.output.read_text())

    def test_ambiguous_responses_never_accept(self):
        for response in [{}, {"data": []}, {"data": [{"id": "first"}, {"id": "second"}]},
                         {"data": {"id": ""}}, {"data": {"id": "x\nsecret=oops"}},
                         {"data": {"id": "id"}, "errors": [{"code": "failed"}]},
                         {"data": {"id": "id"}}] + [{"data": {"id": "id", "state": state}} for state in ["FAILED", "AWAITING_UPLOAD", "UNKNOWN", None]]:
            self.prepare()
            result = self.tool("accept", response, check=False)
            self.assertNotEqual(result.returncode, 0, response)
            self.assertFalse((Path(self.env["UPLOAD_RECEIPT_DIRECTORY"]) / "accepted.json").exists())

    def test_retry_has_distinct_name_and_cannot_erase_previous(self):
        self.prepare()
        first_name = self.outputs()["artifact-name"]
        first = self.accept()
        before = first.read_bytes()
        self.env["GITHUB_RUN_ATTEMPT"] = "2"
        second = self.prepare()
        self.assertNotEqual(first_name, self.outputs()["artifact-name"])
        self.assertIn("-123-2-", self.outputs()["artifact-name"])
        self.assertFalse((second / "accepted.json").exists())
        self.assertEqual(first.read_bytes(), before)

    def test_same_receipt_cannot_be_overwritten(self):
        self.prepare()
        first = self.accept()
        before = first.read_bytes()
        self.assertNotEqual(self.tool("accept", {"data": {"id": "another", "state": "PROCESSING"}}, check=False).returncode, 0)
        self.assertEqual(first.read_bytes(), before)

    def test_actual_upload_boundary_failure_and_success(self):
        boundary = (ACTION / "upload-effects.sh").read_text()
        self.prepare()
        for code, response in [(1, '{"data":{"id":"id","state":"PROCESSING"}}'), (0, '{}'), (0, '{"data":{"id":"id","state":"PROCESSING"}}')]:
            directory = self.prepare()
            prefix = "set -euo pipefail\nrun_asccli() { printf '%s' \"$FAKE_RESPONSE\"; return \"$FAKE_EXIT\"; }\n"
            env = dict(self.env, FAKE_RESPONSE=response, FAKE_EXIT=str(code), PROCESSING_TIMEOUT_SECONDS="1", PROCESSING_POLL_SECONDS="0", SCHEME_NAME="App", IPA_PATH=str(self.root / "app.ipa"), REPOSITORY_ROOT=str(self.root), GITHUB_ACTION_PATH=str(ACTION))
            result = subprocess.run(["bash", "-c", prefix + boundary], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, code == 0 and response != '{}', result.stderr)
            self.assertEqual((directory / "accepted.json").exists(), code == 0 and response != '{}')

    def test_awaiting_upload_must_confirm_same_resource(self):
        boundary = (ACTION / "upload-effects.sh").read_text()
        prefix = """set -euo pipefail
run_asccli() {
  if [[ "$2" == upload ]]; then printf '%s' '{"data":{"id":"first","state":"AWAITING_UPLOAD"}}';
  else printf '%s' "$CONFIRM_RESPONSE"; fi
}
"""
        for response, accepted in [({"data": {"id": "first", "state": "PROCESSING"}}, True),
                                   ({"data": {"id": "other", "state": "PROCESSING"}}, False),
                                   ({"data": {"id": "first", "state": "AWAITING_UPLOAD"}}, False),
                                   ({"data": {"id": "first", "state": "UNKNOWN"}}, False)]:
            directory = self.prepare()
            env = dict(self.env, CONFIRM_RESPONSE=json.dumps(response), PROCESSING_TIMEOUT_SECONDS="1", PROCESSING_POLL_SECONDS="0",
                       SCHEME_NAME="App", IPA_PATH=str(self.root / "app.ipa"), REPOSITORY_ROOT=str(self.root), GITHUB_ACTION_PATH=str(ACTION))
            result = subprocess.run(["bash", "-c", prefix + boundary], env=env, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode == 0, accepted, result.stderr)
            self.assertEqual((directory / "accepted.json").exists(), accepted)

    def boundary(self, before=0, after=0, response=None, mutation=False, resource=0, poll_response=None, fail_resource_state=""):
        directory = self.prepare()
        self.calls = self.root / "boundary-calls"
        self.calls.write_text("")
        hook = self.root / "hook.sh"
        hook.write_text("""#!/bin/bash
printf '%s\\n' "$1" >> "$CALL_LOG"
if [[ "$1" == before ]]; then
  printf '%s' "$IPA_SHA256" > "$DIGEST_LOG"
  if [[ "$MUTATE_IPA" == true ]]; then echo changed >> "$IPA_PATH"; fi
  exit "$BEFORE_STATUS"
fi
if [[ "$1" == resource ]]; then
  cp "$UPLOAD_RECEIPT_PATH" "$RESOURCE_COPY"
  # Acceptance and its output must already exist at the resource hook boundary.
  if grep -qE '\"state\": \"(PROCESSING|COMPLETE)\"' "$UPLOAD_RECEIPT_PATH"; then
    test -s "$UPLOAD_RECEIPT_DIRECTORY/accepted.json" || exit 91
    grep -q '^receipt-path=' "$GITHUB_OUTPUT" || exit 92
  fi
  if [[ -z "$FAIL_RESOURCE_STATE" ]] || python3 -c 'import json,os,sys; sys.exit(json.load(open(os.environ["UPLOAD_RECEIPT_PATH"]))["state"] != os.environ["FAIL_RESOURCE_STATE"])'; then exit "$RESOURCE_STATUS"; fi
fi
if [[ "$1" == after ]]; then test -f "$UPLOAD_RECEIPT_PATH" || exit 90; exit "$AFTER_STATUS"; fi
""")
        hook.chmod(0o755)
        env = dict(self.env, GITHUB_ACTION_PATH=str(ACTION), IPA_PATH=str(self.root / "app.ipa"),
                   REPOSITORY_ROOT=str(self.root), SCHEME_NAME="App", CALL_LOG=str(self.calls),
                   DIGEST_LOG=str(self.root / "digest"), RESOURCE_COPY=str(self.root / "resource-copy.json"),
                   BEFORE_UPLOAD_SCRIPT=str(hook), AFTER_UPLOAD_SCRIPT=str(hook), BEFORE_STATUS=str(before),
                   AFTER_STATUS=str(after), RESOURCE_STATUS=str(resource), FAIL_RESOURCE_STATE=fail_resource_state, MUTATE_IPA=str(mutation).lower(), PROCESSING_TIMEOUT_SECONDS="1", PROCESSING_POLL_SECONDS="0",
                   MORPHEUS_CD_INTENT_ID="intent-1", MORPHEUS_CD_ATTEMPT_ID="attempt-1",
                   MORPHEUS_CD_DISPATCH_EFFECT_ID="dispatch-1", MORPHEUS_CD_SOURCE_SHA=self.sha, MORPHEUS_CD_CONTROL_SHA="b"*40,
                   FAKE_RESPONSE=json.dumps(response or {"data": {"id": "upload-1", "state": "PROCESSING"}}), POLL_RESPONSE=json.dumps(poll_response))
        prefix = 'set -euo pipefail\nrun_asccli() { if [[ "$2" == upload ]]; then echo apple-upload >> "$CALL_LOG"; printf %s "$FAKE_RESPONSE"; else echo apple-poll >> "$CALL_LOG"; printf %s "$POLL_RESPONSE"; fi; }\n'
        result = subprocess.run(["bash", "-c", prefix + 'source "$GITHUB_ACTION_PATH/upload-effects.sh"'], env=env, capture_output=True, text=True)
        return result, directory

    def test_failed_claim_and_duplicate_claim_do_not_upload(self):
        for status, expected in [(1, 1), (3, 0)]:
            result, directory = self.boundary(before=status)
            self.assertEqual(result.returncode, expected, result.stderr)
            self.assertEqual(self.calls.read_text().splitlines(), ["before"])
            self.assertFalse((directory / "accepted.json").exists())
            self.assertNotIn("receipt-path", self.outputs())

    def test_acceptance_survives_after_hook_failure_with_exact_digest_and_identity(self):
        result, directory = self.boundary(after=9)
        self.assertEqual(result.returncode, 9, result.stderr)
        self.assertEqual(self.calls.read_text().splitlines(), ["before", "apple-upload", "resource", "after"])
        receipt = json.loads((directory / "accepted.json").read_text())
        self.assertEqual(self.outputs()["receipt-path"], str(directory / "accepted.json"))
        self.assertEqual(receipt["ipaSha256"], hashlib.sha256(b"verified signed IPA").hexdigest())
        self.assertEqual((self.root / "digest").read_text(), receipt["ipaSha256"])
        self.assertEqual({k: receipt[k] for k in ["intentId", "attemptId", "dispatchEffectId", "controlSha", "sourceSha", "runId", "runAttempt"]},
                         dict(intentId="intent-1", attemptId="attempt-1", dispatchEffectId="dispatch-1", controlSha="b"*40, sourceSha=self.sha, runId="123", runAttempt="1"))
        self.assertNotIn("SECRET", (directory / "accepted.json").read_text())

    def test_known_acceptance_survives_initial_resource_hook_failure(self):
        for state in ["PROCESSING", "COMPLETE"]:
            with self.subTest(state=state):
                result, directory = self.boundary(resource=11, response={"data": {"id": "upload-1", "state": state}})
                self.assertEqual(result.returncode, 11, result.stderr)
                self.assertEqual(self.calls.read_text().splitlines(), ["before", "apple-upload", "resource"])
                self.assertEqual(self.outputs()["receipt-path"], str(directory / "accepted.json"))
                self.assertEqual(json.loads((directory / "accepted.json").read_text())["state"], "accepted")
                self.assertEqual(json.loads(Path(self.outputs()["resource-path"]).read_text())["state"], state)

    def test_known_acceptance_survives_polled_resource_hook_failure(self):
        for state in ["PROCESSING", "COMPLETE"]:
            with self.subTest(state=state):
                result, directory = self.boundary(resource=11, fail_resource_state=state,
                    response={"data": {"id": "upload-1", "state": "AWAITING_UPLOAD"}},
                    poll_response={"data": {"id": "upload-1", "state": state}})
                self.assertEqual(result.returncode, 11, result.stderr)
                self.assertEqual(self.calls.read_text().splitlines(), ["before", "apple-upload", "resource", "apple-poll", "resource"])
                self.assertEqual(self.outputs()["receipt-path"], str(directory / "accepted.json"))
                self.assertEqual(json.loads((directory / "accepted.json").read_text())["uploadId"], "upload-1")

    def test_unaccepted_resource_survives_resource_hook_failure_without_false_acceptance(self):
        for state in ["AWAITING_UPLOAD", "FAILED", "INVALID"]:
            with self.subTest(state=state):
                result, directory = self.boundary(resource=11, response={"data": {"id": "upload-1", "state": state}})
                self.assertEqual(result.returncode, 11, result.stderr)
                self.assertEqual(self.calls.read_text().splitlines(), ["before", "apple-upload", "resource"])
                self.assertEqual(self.outputs()["resource-path"], str(directory / "resource.json"))
                data = json.loads((directory / "resource.json").read_text())
                self.assertEqual((data["state"], data["uploadId"]), (state, "upload-1"))
                self.assertFalse((directory / "accepted.json").exists())
                self.assertNotIn("receipt-path", self.outputs())

    def test_terminal_resource_is_persisted_before_failure_without_build_poll(self):
        result, directory = self.boundary(response={"data": {"id": "upload-1", "state": "FAILED", "errors": [{"code": "INVALID_BINARY", "detail": "SECRET_RESPONSE"}]}})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.calls.read_text().splitlines(), ["before", "apple-upload", "resource"])
        receipt = json.loads((self.root / "resource-copy.json").read_text())
        self.assertEqual(receipt["state"], "FAILED")
        self.assertEqual(receipt["diagnosticCodes"], ["INVALID_BINARY"])
        self.assertNotIn("SECRET", json.dumps(receipt))
        self.assertFalse((directory / "accepted.json").exists())

    def test_changed_ipa_after_claim_cannot_upload(self):
        result, directory = self.boundary(mutation=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.calls.read_text().splitlines(), ["before"])
        self.assertFalse((directory / "accepted.json").exists())

    def test_wrong_source_fails_before_claim(self):
        self.sha = "a" * 40
        result, directory = self.boundary()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.calls.read_text(), "")
        self.assertFalse((directory / "accepted.json").exists())

    def test_delayed_build_visibility_cannot_reuse_reserved_number(self):
        spec = importlib.util.spec_from_file_location("build_number", ACTION / "build-number.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        directory = self.root / "reservations"
        # Both API queries see 41 as latest: the first accepted 42 is still absent.
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 42, True), 42)
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 42, True), 43)
        # A newer Apple result wins; app/version trains do not share a floor.
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 50, True), 50)
        self.assertEqual(module.reserve(directory, "456", "1.2.3", 1, True), 1)
        self.assertEqual(module.reserve(directory, "123", "2.0.0", 1, True), 1)
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 60, False), 60)
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 42, False), 42)
        self.assertEqual(module.reserve(directory, "123", "1.2.3", 51, True), 61)
        # Corruption fails closed rather than allocating an already reserved number.
        for path in directory.glob("*.json"): path.write_text('"invalid"')
        with self.assertRaises(ValueError): module.reserve(directory, "123", "1.2.3", 42, True)

    def test_processing_and_distribution_failure_leave_receipt(self):
        self.prepare()
        receipt = self.accept()
        before = receipt.read_bytes()
        binary = self.root / "bin"
        binary.mkdir()
        plutil = binary / "plutil"
        plutil.write_text("#!/usr/bin/env python3\nimport json,sys\ntry:\n v=json.load(sys.stdin)\n for k in sys.argv[2].split('.'):\n  v=v[int(k)] if isinstance(v,list) else v[k]\n print(v)\nexcept Exception: sys.exit(1)\n")
        plutil.chmod(0o755)
        asc = binary / "asccli"
        asc.write_text("#!/usr/bin/env python3\nimport json,os,sys\na=sys.argv[1:]\nwith open(os.environ['CALL_LOG'],'a') as f: f.write(' '.join(a)+'\\n')\nif a[:3]==['builds','uploads','get']:\n print(json.dumps({'data':{'state':'FAILED' if os.environ['FAIL_AT']=='processing' else 'PROCESSING'}}))\nelif a[:2]==['builds','list']:\n print(json.dumps({'data':[{'id':'build-id','buildNumber':'42','processingState':'VALID'}]}))\nelse: sys.exit(1)\n")
        asc.chmod(0o755)
        for stage in ["processing", "groups"]:
            env = dict(self.env, PATH=str(binary)+os.pathsep+os.environ["PATH"], FAIL_AT=stage, CALL_LOG=str(self.root / "calls"),
                       ASC_API_KEY_P8_BASE64="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCg==", ASC_API_KEY_ID="key", ASC_API_KEY_ISSUER_ID="issuer",
                       UPLOAD_ID="12345678-1234-1234-1234-123456789abc", SCHEME_NAME="App", TESTFLIGHT_BETA_GROUP_IDS="12345678-1234-1234-1234-123456789abc", GITHUB_ACTION_PATH=str(ACTION))
            result = subprocess.run(["bash", str(ACTION / "distribute-testflight.sh")], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            if stage == "processing": self.assertIn("failed processing", result.stderr)
            else:
                self.assertNotIn("failed processing", result.stderr)
                self.assertIn("builds add-beta-group --build-id build-id", (self.root / "calls").read_text())
            self.assertEqual(receipt.read_bytes(), before)
            self.assertEqual(list(self.root.glob('ios-testflight-distribution.*')), [])

if __name__ == "__main__":
    unittest.main()
