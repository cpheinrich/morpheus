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
        self.tool("accept", response or {"data": [{"id": "12345678-1234-1234-1234-123456789abc"}]})
        return Path(self.outputs()["receipt-path"])

    def test_preupload_failure_has_no_acceptance(self):
        directory = self.prepare()
        self.assertFalse((directory / "accepted.json").exists())
        self.assertNotIn("receipt-path", self.outputs())

    def test_exact_fields_are_sanitized(self):
        self.prepare()
        receipt = self.accept({"data": {"id": "12345678-1234-1234-1234-123456789abc", "private": "SECRET_RESPONSE"}})
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
                         {"data": {"id": "id", "state": "FAILED"}}]:
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
        self.assertNotEqual(self.tool("accept", {"data": {"id": "another"}}, check=False).returncode, 0)
        self.assertEqual(first.read_bytes(), before)

    def test_actual_upload_boundary_failure_and_success(self):
        raw = (ACTION / "upload-testflight.sh").read_text()
        boundary = raw[raw.index('echo "Uploading $SCHEME_NAME'):]
        self.prepare()
        for code, response in [(1, '{"data":{"id":"id"}}'), (0, '{}'), (0, '{"data":{"id":"id"}}')]:
            directory = self.prepare()
            prefix = "set -euo pipefail\nrun_asccli() { printf '%s' \"$FAKE_RESPONSE\"; return \"$FAKE_EXIT\"; }\n"
            env = dict(self.env, FAKE_RESPONSE=response, FAKE_EXIT=str(code), SCHEME_NAME="App", IPA_PATH="app.ipa", GITHUB_ACTION_PATH=str(ACTION))
            result = subprocess.run(["bash", "-c", prefix + boundary], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, code == 0 and response != '{}', result.stderr)
            self.assertEqual((directory / "accepted.json").exists(), code == 0 and response != '{}')

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
