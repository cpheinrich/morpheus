#!/bin/bash
# Sourced only after the archive/export/signature/entitlement checks pass.
# Keep this boundary runnable with fake asccli/hooks in behavioral tests.
export MARKETING_VERSION BUILD_NUMBER ASC_APP_ID
IPA_SHA256="$(shasum -a 256 "$IPA_PATH" | awk '{print $1}')"
export IPA_SHA256
# Validate complete CD identity and the actual source before claiming an effect.
python3 "$GITHUB_ACTION_PATH/upload-receipt.py" validate

run_upload_hook() (
  cd "$REPOSITORY_ROOT"
  "$1" "$2"
)
if [[ -n "${BEFORE_UPLOAD_SCRIPT:-}" ]]; then
  claim_status=0
  run_upload_hook "$BEFORE_UPLOAD_SCRIPT" before || claim_status=$?
  if [[ "$claim_status" == 3 ]]; then
    echo "Upload already claimed, accepted, or uncertain; no Apple upload authorized."
    exit 0
  fi
  if [[ "$claim_status" != 0 ]]; then
    echo "Upload claim failed; no Apple upload authorized." >&2
    exit 1
  fi
fi
if [[ "$(shasum -a 256 "$IPA_PATH" | awk '{print $1}')" != "$IPA_SHA256" ]]; then
  echo "IPA changed after upload claim; refusing upload." >&2
  exit 1
fi

echo "Uploading $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) to App Store Connect."
upload_json="$(run_asccli builds upload --app-id "$ASC_APP_ID" --file "$IPA_PATH" \
  --version "$MARKETING_VERSION" --build-number "$BUILD_NUMBER" --platform ios --output json)"
# Publish an allowlisted resource before acceptance polling, including terminal
# failure diagnostics. No build-list poll is appropriate for a failed resource.
record_upload_resource() {
  UPLOAD_RECEIPT_PATH="$(printf '%s' "$upload_json" | python3 "$GITHUB_ACTION_PATH/upload-receipt.py" resource)"
  export UPLOAD_RECEIPT_PATH
  if [[ -n "${BEFORE_UPLOAD_SCRIPT:-}" ]]; then
    run_upload_hook "$BEFORE_UPLOAD_SCRIPT" resource
  fi
}
record_upload_resource
upload_description="$(printf '%s' "$upload_json" | python3 "$GITHUB_ACTION_PATH/upload-receipt.py" describe)"
read -r upload_id upload_state <<< "$upload_description"
acceptance_deadline=$(($(date '+%s') + PROCESSING_TIMEOUT_SECONDS))
while [[ "$upload_state" == AWAITING_UPLOAD ]]; do
  if [[ "$(date '+%s')" -ge "$acceptance_deadline" ]]; then
    echo "Timed out confirming upload acceptance; outcome remains uncertain." >&2
    exit 1
  fi
  sleep "$PROCESSING_POLL_SECONDS"
  upload_json="$(run_asccli builds uploads get --upload-id "$upload_id" --output json)"
  upload_description="$(printf '%s' "$upload_json" | python3 "$GITHUB_ACTION_PATH/upload-receipt.py" describe)"
  read -r confirmed_id upload_state <<< "$upload_description"
  if [[ "$confirmed_id" != "$upload_id" ]]; then
    echo "Upload confirmation id changed; outcome remains uncertain." >&2
    exit 1
  fi
  record_upload_resource
done
if [[ "$upload_state" == FAILED || "$upload_state" == INVALID ]]; then
  echo "Apple upload resource $upload_id is $upload_state; terminal diagnostics persisted." >&2
  exit 1
fi
printf '%s' "$upload_json" | python3 "$GITHUB_ACTION_PATH/upload-receipt.py" accept
# accept writes outputs first: always() artifact persistence can run even if the
# ledger is unavailable here. Absence of a successful hook never erases acceptance.
UPLOAD_RECEIPT_PATH="$UPLOAD_RECEIPT_DIRECTORY/accepted.json"
export UPLOAD_RECEIPT_PATH
if [[ -n "${AFTER_UPLOAD_SCRIPT:-}" ]]; then
  run_upload_hook "$AFTER_UPLOAD_SCRIPT" after
fi
