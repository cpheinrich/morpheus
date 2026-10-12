#!/bin/bash
# Runs only after the acceptance artifact is durable. No signing credentials enter here.
set -Eeuo pipefail
set +x
umask 077
ASC_CLI="${ASC_CLI:-asccli}"
PROCESSING_TIMEOUT_SECONDS="${PROCESSING_TIMEOUT_SECONDS:-1200}"
PROCESSING_POLL_SECONDS="${PROCESSING_POLL_SECONDS:-30}"
upload_id="${UPLOAD_ID:?Missing confirmed upload id}"
: "${MARKETING_VERSION:?Missing accepted version}" "${BUILD_NUMBER:?Missing accepted build number}"
RELEASE_TEMP_DIRECTORY="$(mktemp -d "$RUNNER_TEMP/ios-testflight-distribution.XXXXXX")"
AUTHENTICATION_KEY_PATH="$RELEASE_TEMP_DIRECTORY/AuthKey.p8"
cleanup() { rm -f "$AUTHENTICATION_KEY_PATH"; rmdir "$RELEASE_TEMP_DIRECTORY"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s' "$ASC_API_KEY_P8_BASE64" | /usr/bin/base64 --decode > "$AUTHENTICATION_KEY_PATH"
unset ASC_API_KEY_P8_BASE64
export ASC_KEY_ID="$ASC_API_KEY_ID"
export ASC_ISSUER_ID="$ASC_API_KEY_ISSUER_ID"
export ASC_PRIVATE_KEY_PATH="$AUTHENTICATION_KEY_PATH"
source "$GITHUB_ACTION_PATH/asc-helpers.sh"
beta_group_ids=()
while IFS= read -r beta_group_id; do
  beta_group_id="$(printf '%s\n' "$beta_group_id" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -z "$beta_group_id" ]] || beta_group_ids+=("$beta_group_id")
done < <(printf '%s\n' "$TESTFLIGHT_BETA_GROUP_IDS" | tr ',' '\n')

processing_deadline=$(($(date '+%s') + PROCESSING_TIMEOUT_SECONDS))
processed_build_id=""
while [[ -z "$processed_build_id" ]]; do
  upload_status_json=""
  if upload_status_json="$(
    run_asccli builds uploads get \
      --upload-id "$upload_id" \
      --output json
  )"; then
    upload_state="$(json_value "$upload_status_json" "data.0.state" || json_value "$upload_status_json" "data.state" || true)"
    if [[ "$upload_state" == "FAILED" ]]; then
      upload_error_code="$(json_value "$upload_status_json" "data.0.errors.0.code" || json_value "$upload_status_json" "data.errors.0.code" || true)"
      upload_error_description="$(json_value "$upload_status_json" "data.0.errors.0.description" || json_value "$upload_status_json" "data.errors.0.description" || true)"
      echo "App Store Connect failed processing $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER): ${upload_error_code:-unknown error}: ${upload_error_description:-No description returned.}" >&2
      exit 1
    fi
  else
    echo "App Store Connect upload-status lookup failed; retrying until the processing deadline." >&2
  fi

  builds_json=""
  if builds_json="$(
    run_asccli builds list \
      --app-id "$ASC_APP_ID" \
      --platform ios \
      --version "$MARKETING_VERSION" \
      --limit 200 \
      --output json
  )"; then
    build_index=0
    while candidate_id="$(json_value "$builds_json" "data.$build_index.id")"; do
      candidate_number="$(json_value "$builds_json" "data.$build_index.buildNumber")"
      if [[ "$candidate_number" == "$BUILD_NUMBER" ]]; then
        processing_state="$(json_value "$builds_json" "data.$build_index.processingState")"
        case "$processing_state" in
          VALID) processed_build_id="$candidate_id" ;;
          PROCESSING) echo "$SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) is still processing." ;;
          *)
            echo "$SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) entered terminal state $processing_state." >&2
            exit 1
            ;;
        esac
        break
      fi
      build_index=$((build_index + 1))
    done
  else
    echo "App Store Connect build lookup failed; retrying until the processing deadline." >&2
  fi

  [[ -n "$processed_build_id" ]] && break
  if [[ "$(date '+%s')" -ge "$processing_deadline" ]]; then
    echo "Timed out waiting for $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) to finish processing." >&2
    exit 1
  fi
  sleep "$PROCESSING_POLL_SECONDS"
done

for beta_group_id in "${beta_group_ids[@]}"; do
  run_asccli builds add-beta-group \
    --build-id "$processed_build_id" \
    --beta-group-id "$beta_group_id" \
    --output json
  echo "Assigned $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) to beta group $beta_group_id."
done

# Apple requires a Beta App Review approval before external testers can install
# a build. asccli has no command for it, so this speaks to the REST API using
# the same App Store Connect key already on disk.
#
# "Another build in the same train is already in beta review" is a success, not
# a failure. Apple refuses a second submission while one is pending, and a
# nightly cadence hits that most nights. Cancelling the pending one to push the
# newer build would be worse than useless: review takes about a day, so a
# nightly build would restart the clock every night and nothing would ever be
# approved. Once a version's first build is approved, later builds of the same
# version are approved automatically, so the freshest build does reach testers.
if [[ "${SUBMIT_FOR_BETA_REVIEW:-false}" == "true" ]]; then
  submit_status="$(
    ASC_SUBMIT_BUILD_ID="$processed_build_id" \
    ASC_SUBMIT_KEY_ID="$ASC_API_KEY_ID" \
    ASC_SUBMIT_ISSUER_ID="$ASC_API_KEY_ISSUER_ID" \
    ASC_SUBMIT_KEY_PATH="$AUTHENTICATION_KEY_PATH" \
    /usr/bin/python3 - <<'PYTHON'
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request

def b64u(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")

def der_to_raw(signature):
    assert signature[0] == 0x30
    index = 2 if signature[1] < 0x80 else 2 + (signature[1] & 0x7F)
    parts = []
    for _ in range(2):
        assert signature[index] == 0x02
        length = signature[index + 1]
        value = signature[index + 2:index + 2 + length]
        index += 2 + length
        parts.append(value.lstrip(b"\x00").rjust(32, b"\x00"))
    return b"".join(parts)

now = int(time.time())
header = b64u(json.dumps({"alg": "ES256", "kid": os.environ["ASC_SUBMIT_KEY_ID"], "typ": "JWT"}, separators=(",", ":")).encode())
payload = b64u(json.dumps({"iss": os.environ["ASC_SUBMIT_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
signing_input = header + b"." + payload
der = subprocess.run(
    ["openssl", "dgst", "-sha256", "-sign", os.environ["ASC_SUBMIT_KEY_PATH"]],
    input=signing_input, capture_output=True, check=True,
).stdout
token = (signing_input + b"." + b64u(der_to_raw(der))).decode()

request = urllib.request.Request(
    "https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions",
    data=json.dumps({
        "data": {
            "type": "betaAppReviewSubmissions",
            "relationships": {"build": {"data": {"type": "builds", "id": os.environ["ASC_SUBMIT_BUILD_ID"]}}},
        }
    }).encode(),
    method="POST",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
)
def review_state():
    # Ask Apple for the current state rather than inferring it from an error code.
    lookup = urllib.request.Request(
        "https://api.appstoreconnect.apple.com/v1/builds/%s/betaAppReviewSubmission" % os.environ["ASC_SUBMIT_BUILD_ID"],
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.urlopen(lookup) as response:
            data = json.load(response).get("data")
            return data["attributes"].get("betaReviewState") if data else None
    except urllib.error.HTTPError:
        return None

try:
    with urllib.request.urlopen(request) as response:
        print("submitted:" + str(json.load(response)["data"]["attributes"].get("betaReviewState")))
except urllib.error.HTTPError as error:
    body = error.read().decode()
    # A rejection here is only acceptable if a submission genuinely exists —
    # either one for this build, or a sibling in the same version train holding
    # the single review slot. Ask, rather than trusting the error code to mean
    # what it appears to mean.
    existing = review_state()
    if existing:
        print("pending:this-build-" + str(existing))
    elif "ANOTHER_BUILD_IN_REVIEW" in body:
        print("pending:sibling-build-in-review")
    else:
        sys.stderr.write(body[:800] + "\n")
        sys.exit(1)
PYTHON
  )"
  case "$submit_status" in
    submitted:*)
      echo "Submitted $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) for Beta App Review (${submit_status#submitted:})."
      ;;
    pending:*)
      echo "Beta App Review not newly submitted (${submit_status#pending:}); an earlier build of this version holds the review slot, and later builds are approved with it."
      ;;
    *)
      echo "Beta App Review submission failed." >&2
      exit 1
      ;;
  esac
fi
