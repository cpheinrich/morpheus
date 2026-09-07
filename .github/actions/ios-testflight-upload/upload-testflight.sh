#!/bin/bash
#
# Archive an iOS app unsigned, export a distribution-signed IPA, verify the
# artifact that will actually ship, upload it to App Store Connect, and assign
# it to TestFlight beta groups.
#
# This runs inside the calling repository's own job, from a composite action,
# so `secrets.*` resolve normally and arrive here as ordinary environment
# variables. That is the whole reason it is an action and not a reusable
# workflow: GitHub hands a cross-repository reusable workflow no caller
# environment secrets at all, and every one of them reads as an empty string.
#
# Every input is read from the environment; `action.yml` is the only thing that
# writes it. See that file for the caller-facing contract.

set -Eeuo pipefail
set +x
umask 077

PLIST_BUDDY=/usr/libexec/PlistBuddy

REPOSITORY_ROOT="${GITHUB_WORKSPACE:-$PWD}"
PROJECT_PATH="${PROJECT_PATH:-}"
SCHEME_NAME="${SCHEME_NAME:-}"
SOURCE_PACKAGES_PATH="${SOURCE_PACKAGES_PATH:-${RUNNER_TEMP:-/private/tmp}/TestFlightSourcePackages}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${RUNNER_TEMP:-/private/tmp}/TestFlightDerivedData-archive}"
ARCHIVE_PATH="${ARCHIVE_PATH:-${RUNNER_TEMP:-/private/tmp}/TestFlight.xcarchive}"
BUILD_NUMBER="${BUILD_NUMBER:-}"
MARKETING_VERSION="${MARKETING_VERSION:-}"
ASC_APP_ID="${ASC_APP_ID:-}"
TESTFLIGHT_BETA_GROUP_IDS="${TESTFLIGHT_BETA_GROUP_IDS:-}"
BETA_GROUP_POLICY="${BETA_GROUP_POLICY:-any}"
ARCHIVE_BUILD_SETTINGS="${ARCHIVE_BUILD_SETTINGS:-}"
GOOGLE_SERVICE_PLIST_PATH="${GOOGLE_SERVICE_PLIST_PATH:-}"
VALIDATE_APP_SCRIPT="${VALIDATE_APP_SCRIPT:-}"
ASC_CLI="${ASC_CLI:-asccli}"
PROCESSING_TIMEOUT_SECONDS="${PROCESSING_TIMEOUT_SECONDS:-1200}"
PROCESSING_POLL_SECONDS="${PROCESSING_POLL_SECONDS:-30}"
OPENSSL_BINARY="${OPENSSL_BINARY:-}"

# A TestFlight build is a release. It may only ever be cut from main: a run on
# any other ref has not passed the reviewed-source preflight.
if [[ "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo "Refusing to upload a TestFlight build outside main." >&2
  exit 1
fi

required_variables=(
  PROJECT_PATH
  SCHEME_NAME
  APPLE_TEAM_ID
  IOS_BUNDLE_ID
  ASC_APP_ID
  TESTFLIGHT_BETA_GROUP_IDS
  ASC_API_KEY_ID
  ASC_API_KEY_ISSUER_ID
  ASC_API_KEY_P8_BASE64
  IOS_DISTRIBUTION_P12_BASE64
  IOS_DISTRIBUTION_P12_PASSWORD
  IOS_DISTRIBUTION_PROFILE_BASE64
  OPENSSL_BINARY
  RUNNER_TEMP
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required release variable: $variable_name" >&2
    exit 1
  fi
done

if [[ -n "$BUILD_NUMBER" && ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUILD_NUMBER must be a positive integer." >&2
  exit 1
fi

if [[ ! "$ASC_APP_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "ASC_APP_ID must be a positive integer." >&2
  exit 1
fi

if [[ ! "$PROCESSING_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] ||
  [[ ! "$PROCESSING_POLL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Processing timeout and poll interval must be positive integers." >&2
  exit 1
fi

case "$BETA_GROUP_POLICY" in
  any | one-internal-one-external) ;;
  *)
    echo "beta-group-policy must be 'any' or 'one-internal-one-external'." >&2
    exit 1
    ;;
esac

# Repository-relative caller paths are resolved against the workspace and may
# not climb out of it.
resolve_repository_path() {
  local relative_path="$1"
  local label="$2"
  case "$relative_path" in
    "" | /* | *"../"* | *"/.." | "..")
      echo "$label must be a repository-relative path without '..': $relative_path" >&2
      exit 1
      ;;
  esac
  printf '%s' "$REPOSITORY_ROOT/$relative_path"
}

if [[ -n "$GOOGLE_SERVICE_PLIST_PATH" ]]; then
  if [[ -z "${IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64:-}" ]]; then
    echo "google-service-info-plist-path is set but its base64 configuration is empty." >&2
    exit 1
  fi
  FIREBASE_PLIST_PATH="$(resolve_repository_path "$GOOGLE_SERVICE_PLIST_PATH" "google-service-info-plist-path")"
else
  FIREBASE_PLIST_PATH=""
fi

if [[ -n "$VALIDATE_APP_SCRIPT" ]]; then
  VALIDATE_APP_SCRIPT_PATH="$(resolve_repository_path "$VALIDATE_APP_SCRIPT" "validate-app-script")"
  if [[ ! -x "$VALIDATE_APP_SCRIPT_PATH" ]]; then
    echo "validate-app-script is missing or not executable: $VALIDATE_APP_SCRIPT" >&2
    exit 1
  fi
else
  VALIDATE_APP_SCRIPT_PATH=""
fi

# Accept either newline- or comma-separated ids so a caller can write the list
# as a YAML block or on one line.
beta_group_ids=()
while IFS= read -r beta_group_id; do
  beta_group_id="$(printf '%s\n' "$beta_group_id" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -z "$beta_group_id" ]] && continue
  if [[ ! "$beta_group_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "Invalid TestFlight beta-group id: $beta_group_id" >&2
    exit 1
  fi
  beta_group_ids+=("$beta_group_id")
done < <(printf '%s\n' "$TESTFLIGHT_BETA_GROUP_IDS" | tr ',' '\n')

if [[ "${#beta_group_ids[@]}" -lt 1 || "${#beta_group_ids[@]}" -gt 4 ]]; then
  echo "A release requires between one and four TestFlight beta-group ids." >&2
  exit 1
fi

if [[ "$BETA_GROUP_POLICY" == one-internal-one-external ]]; then
  if [[ "${#beta_group_ids[@]}" -ne 2 || "${beta_group_ids[0]}" == "${beta_group_ids[1]}" ]]; then
    echo "This release policy requires two distinct TestFlight beta-group ids." >&2
    exit 1
  fi
fi

# Build settings arrive as newline-separated KEY=VALUE lines and are passed as
# whole argv elements, never spliced into a command string. An empty value is
# meaningful — `KAIROS_API_BASE_URL=` pins the app to no backend — so the
# pattern deliberately allows it.
archive_build_settings=()
while IFS= read -r build_setting; do
  build_setting="$(printf '%s\n' "$build_setting" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -z "$build_setting" ]] && continue
  if [[ ! "$build_setting" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    echo "archive-build-settings entries must be KEY=VALUE: $build_setting" >&2
    exit 1
  fi
  archive_build_settings+=("$build_setting")
done <<< "$ARCHIVE_BUILD_SETTINGS"

if [[ ! -f "$PROJECT_PATH/project.pbxproj" ]]; then
  echo "Xcode project not found at $PROJECT_PATH" >&2
  exit 1
fi

if [[ ! -x "$OPENSSL_BINARY" ]]; then
  echo "OpenSSL 3 is required to prepare the protected distribution identity." >&2
  exit 1
fi

if ! command -v "$ASC_CLI" >/dev/null 2>&1; then
  echo "asccli is required to allocate and distribute the TestFlight build." >&2
  exit 1
fi

# Dependency resolution and metadata queries are credential-free. Keep every
# release secret out of their child environments while retaining them in this
# parent shell for the archive, whose build phases legitimately need the Sentry
# token to upload debug symbols.
run_without_release_secrets() (
  unset ASC_API_KEY_P8_BASE64
  unset ASC_API_KEY_ID
  unset ASC_API_KEY_ISSUER_ID
  unset IOS_DISTRIBUTION_P12_BASE64
  unset IOS_DISTRIBUTION_P12_PASSWORD
  unset IOS_DISTRIBUTION_PROFILE_BASE64
  unset IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64
  unset SENTRY_AUTH_TOKEN
  unset ASC_KEY_ID
  unset ASC_ISSUER_ID
  unset ASC_PRIVATE_KEY_PATH
  "$@"
)

run_without_release_secrets xcodebuild -resolvePackageDependencies \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME_NAME" \
  -clonedSourcePackagesDirPath "$SOURCE_PACKAGES_PATH" \
  -onlyUsePackageVersionsFromResolvedFile

if [[ -z "$MARKETING_VERSION" ]]; then
  MARKETING_VERSION="$(
    run_without_release_secrets xcodebuild -showBuildSettings \
      -project "$PROJECT_PATH" \
      -scheme "$SCHEME_NAME" \
      -configuration Release \
      -destination "generic/platform=iOS" \
      -clonedSourcePackagesDirPath "$SOURCE_PACKAGES_PATH" \
      -disableAutomaticPackageResolution \
      -onlyUsePackageVersionsFromResolvedFile |
      sed -nE 's/^[[:space:]]*MARKETING_VERSION = (.*)$/\1/p' |
      sort -u
  )"
fi

if [[ ! "$MARKETING_VERSION" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  echo "Expected one numeric MARKETING_VERSION from the release target; got '$MARKETING_VERSION'." >&2
  exit 1
fi

RELEASE_TEMP_DIRECTORY="$(mktemp -d "$RUNNER_TEMP/ios-testflight.XXXXXX")"
AUTHENTICATION_KEY_PATH="$RELEASE_TEMP_DIRECTORY/AuthKey_$ASC_API_KEY_ID.p8"
SIGNING_CERTIFICATE_PATH="$RELEASE_TEMP_DIRECTORY/distribution.p12"
SIGNING_IDENTITY_PEM_PATH="$RELEASE_TEMP_DIRECTORY/distribution.pem"
SIGNING_COMPATIBLE_CERTIFICATE_PATH="$RELEASE_TEMP_DIRECTORY/distribution-compatible.p12"
SIGNING_PROFILE_PATH="$RELEASE_TEMP_DIRECTORY/distribution.mobileprovision"
SIGNING_PROFILE_PLIST_PATH="$RELEASE_TEMP_DIRECTORY/distribution.plist"
SIGNING_PROFILE_CERTIFICATE_PATH="$RELEASE_TEMP_DIRECTORY/distribution.cer"
SIGNING_KEYCHAIN_PATH="$RELEASE_TEMP_DIRECTORY/release-signing.keychain-db"
EXPORTED_ENTITLEMENTS_PATH="$RELEASE_TEMP_DIRECTORY/exported-entitlements.plist"
EXPORT_DIRECTORY="$RELEASE_TEMP_DIRECTORY/export"
IPA_CONTENTS_PATH="$RELEASE_TEMP_DIRECTORY/ipa-contents"
EXPORT_OPTIONS_PATH="$RELEASE_TEMP_DIRECTORY/ExportOptions.plist"
FIREBASE_PLIST_BACKUP_PATH="$RELEASE_TEMP_DIRECTORY/preexisting-GoogleService-Info.plist"
INSTALLED_PROFILE_PATH=""
INSTALLED_PROFILE_BACKUP_PATH="$RELEASE_TEMP_DIRECTORY/preexisting-profile.mobileprovision"
RESTORE_INSTALLED_PROFILE=false
RESTORE_FIREBASE_PLIST=false

original_keychains=()
while IFS= read -r keychain_path; do
  keychain_path="$(printf '%s\n' "$keychain_path" |
    sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//')"
  if [[ -n "$keychain_path" ]]; then
    original_keychains+=("$keychain_path")
  fi
done < <(security list-keychains -d user)
ORIGINAL_DEFAULT_KEYCHAIN="$(
  security default-keychain -d user |
    sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//'
)"

cleanup() {
  if [[ -n "$ORIGINAL_DEFAULT_KEYCHAIN" ]]; then
    security default-keychain -d user -s "$ORIGINAL_DEFAULT_KEYCHAIN" >/dev/null 2>&1 || true
  fi
  if [[ "${#original_keychains[@]}" -gt 0 ]]; then
    security list-keychains -d user -s "${original_keychains[@]}" >/dev/null 2>&1 || true
  fi
  security delete-keychain "$SIGNING_KEYCHAIN_PATH" >/dev/null 2>&1 || true

  if [[ -n "$INSTALLED_PROFILE_PATH" ]]; then
    if [[ "$RESTORE_INSTALLED_PROFILE" == true ]]; then
      cp "$INSTALLED_PROFILE_BACKUP_PATH" "$INSTALLED_PROFILE_PATH" >/dev/null 2>&1 || true
    else
      rm -f "$INSTALLED_PROFILE_PATH"
    fi
  fi
  if [[ -n "$FIREBASE_PLIST_PATH" ]]; then
    if [[ "$RESTORE_FIREBASE_PLIST" == true ]]; then
      cp "$FIREBASE_PLIST_BACKUP_PATH" "$FIREBASE_PLIST_PATH" >/dev/null 2>&1 || true
    else
      rm -f "$FIREBASE_PLIST_PATH"
    fi
  fi
  rm -f \
    "$AUTHENTICATION_KEY_PATH" \
    "$SIGNING_CERTIFICATE_PATH" \
    "$SIGNING_IDENTITY_PEM_PATH" \
    "$SIGNING_COMPATIBLE_CERTIFICATE_PATH" \
    "$SIGNING_PROFILE_PATH" \
    "$SIGNING_PROFILE_PLIST_PATH" \
    "$SIGNING_PROFILE_CERTIFICATE_PATH" \
    "$EXPORTED_ENTITLEMENTS_PATH" \
    "$INSTALLED_PROFILE_BACKUP_PATH" \
    "$FIREBASE_PLIST_BACKUP_PATH" \
    "$EXPORT_OPTIONS_PATH"
  rm -rf "$EXPORT_DIRECTORY" "$IPA_CONTENTS_PATH"
  rmdir "$RELEASE_TEMP_DIRECTORY" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# A project whose Firebase client configuration is not checked in receives it
# here, from a secret, for the duration of the archive only. Whether it is the
# *right* configuration is the caller's assertion to make, against the archived
# bundle, in validate-app-script.
if [[ -n "$FIREBASE_PLIST_PATH" ]]; then
  if [[ -e "$FIREBASE_PLIST_PATH" || -L "$FIREBASE_PLIST_PATH" ]]; then
    if [[ ! -f "$FIREBASE_PLIST_PATH" || -L "$FIREBASE_PLIST_PATH" ]]; then
      echo "Refusing to replace a non-regular Firebase client configuration path." >&2
      exit 1
    fi
    cp "$FIREBASE_PLIST_PATH" "$FIREBASE_PLIST_BACKUP_PATH"
    chmod 600 "$FIREBASE_PLIST_BACKUP_PATH"
    RESTORE_FIREBASE_PLIST=true
  fi

  printf '%s' "$IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64" | /usr/bin/base64 -D > "$FIREBASE_PLIST_PATH"
  chmod 600 "$FIREBASE_PLIST_PATH"
  if ! "$PLIST_BUDDY" -c "Print :BUNDLE_ID" "$FIREBASE_PLIST_PATH" >/dev/null 2>&1; then
    echo "The decoded Firebase client configuration is not a readable property list." >&2
    exit 1
  fi
fi
unset IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64

printf '%s' "$ASC_API_KEY_P8_BASE64" | /usr/bin/base64 -D > "$AUTHENTICATION_KEY_PATH"
printf '%s' "$IOS_DISTRIBUTION_P12_BASE64" | /usr/bin/base64 -D > "$SIGNING_CERTIFICATE_PATH"
printf '%s' "$IOS_DISTRIBUTION_PROFILE_BASE64" | /usr/bin/base64 -D > "$SIGNING_PROFILE_PATH"
chmod 600 "$AUTHENTICATION_KEY_PATH" "$SIGNING_CERTIFICATE_PATH" "$SIGNING_PROFILE_PATH"
unset ASC_API_KEY_P8_BASE64 IOS_DISTRIBUTION_P12_BASE64 IOS_DISTRIBUTION_PROFILE_BASE64

if ! grep -q "BEGIN PRIVATE KEY" "$AUTHENTICATION_KEY_PATH"; then
  echo "The decoded App Store Connect key is not a PKCS #8 private key." >&2
  exit 1
fi

export ASC_KEY_ID="$ASC_API_KEY_ID"
export ASC_ISSUER_ID="$ASC_API_KEY_ISSUER_ID"
export ASC_PRIVATE_KEY_PATH="$AUTHENTICATION_KEY_PATH"

run_asccli() (
  unset IOS_DISTRIBUTION_P12_BASE64
  unset IOS_DISTRIBUTION_P12_PASSWORD
  unset IOS_DISTRIBUTION_PROFILE_BASE64
  unset IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64
  unset SENTRY_AUTH_TOKEN
  "$ASC_CLI" "$@"
)

json_value() {
  printf '%s' "$1" | plutil -extract "$2" raw -o - - 2>/dev/null
}

if ! security cms -D -i "$SIGNING_PROFILE_PATH" > "$SIGNING_PROFILE_PLIST_PATH"; then
  echo "The decoded distribution profile is not a valid provisioning profile." >&2
  exit 1
fi

PROFILE_UUID="$(plutil -extract UUID raw -o - "$SIGNING_PROFILE_PLIST_PATH")"
PROFILE_TEAM_ID="$(plutil -extract TeamIdentifier.0 raw -o - "$SIGNING_PROFILE_PLIST_PATH")"
PROFILE_APPLICATION_IDENTIFIER="$(plutil -extract Entitlements.application-identifier raw -o - "$SIGNING_PROFILE_PLIST_PATH")"
PROFILE_EXPIRATION_EPOCH="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' \
  "$(plutil -extract ExpirationDate raw -o - "$SIGNING_PROFILE_PLIST_PATH")" '+%s')"

if [[ ! "$PROFILE_UUID" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  echo "The distribution profile has an invalid UUID." >&2
  exit 1
fi
if [[ "$PROFILE_TEAM_ID" != "$APPLE_TEAM_ID" ]]; then
  echo "The distribution profile belongs to a different Apple team." >&2
  exit 1
fi
if [[ "$PROFILE_APPLICATION_IDENTIFIER" != "$APPLE_TEAM_ID.$IOS_BUNDLE_ID" ]]; then
  echo "The distribution profile does not match the release bundle identifier." >&2
  exit 1
fi
if [[ "$PROFILE_EXPIRATION_EPOCH" -le "$(date '+%s')" ]]; then
  echo "The distribution profile has expired." >&2
  exit 1
fi

SIGNING_KEYCHAIN_PASSWORD="$($OPENSSL_BINARY rand -hex 32)"
security create-keychain -p "$SIGNING_KEYCHAIN_PASSWORD" "$SIGNING_KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$SIGNING_KEYCHAIN_PATH"
security unlock-keychain -p "$SIGNING_KEYCHAIN_PASSWORD" "$SIGNING_KEYCHAIN_PATH"

# OpenSSL 3's default PBES2 PKCS#12 envelope is what the GitHub secret holds.
# Apple's Keychain importer requires the legacy-compatible envelope, so re-wrap
# it only inside this ephemeral, mode-0600 directory. The temporary unencrypted
# PEM never leaves the runner and is removed as soon as Keychain has the
# identity.
"$OPENSSL_BINARY" pkcs12 \
  -in "$SIGNING_CERTIFICATE_PATH" \
  -passin env:IOS_DISTRIBUTION_P12_PASSWORD \
  -nodes \
  -out "$SIGNING_IDENTITY_PEM_PATH"
"$OPENSSL_BINARY" pkcs12 \
  -export \
  -legacy \
  -in "$SIGNING_IDENTITY_PEM_PATH" \
  -passout env:IOS_DISTRIBUTION_P12_PASSWORD \
  -out "$SIGNING_COMPATIBLE_CERTIFICATE_PATH"
chmod 600 "$SIGNING_IDENTITY_PEM_PATH" "$SIGNING_COMPATIBLE_CERTIFICATE_PATH"

security import "$SIGNING_COMPATIBLE_CERTIFICATE_PATH" \
  -k "$SIGNING_KEYCHAIN_PATH" \
  -P "$IOS_DISTRIBUTION_P12_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
unset IOS_DISTRIBUTION_P12_PASSWORD
rm -f "$SIGNING_CERTIFICATE_PATH" "$SIGNING_IDENTITY_PEM_PATH" "$SIGNING_COMPATIBLE_CERTIFICATE_PATH"
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$SIGNING_KEYCHAIN_PASSWORD" \
  "$SIGNING_KEYCHAIN_PATH" >/dev/null
unset SIGNING_KEYCHAIN_PASSWORD

security list-keychains -d user -s "$SIGNING_KEYCHAIN_PATH" "${original_keychains[@]}"
security default-keychain -d user -s "$SIGNING_KEYCHAIN_PATH"

SIGNING_IDENTITY_SHA1="$(
  security find-identity -v -p codesigning "$SIGNING_KEYCHAIN_PATH" |
    sed -nE 's/^[[:space:]]*[0-9]+\)[[:space:]]+([[:xdigit:]]{40})[[:space:]].*/\1/p'
)"
# One line, or the regex below fails: more than one identity means the export
# could pick a different certificate than the one the profile authorizes.
if [[ ! "$SIGNING_IDENTITY_SHA1" =~ ^[0-9A-F]{40}$ ]]; then
  echo "Expected exactly one valid distribution signing identity in the release keychain." >&2
  exit 1
fi

plutil -extract DeveloperCertificates.0 raw -o - "$SIGNING_PROFILE_PLIST_PATH" |
  /usr/bin/base64 -D > "$SIGNING_PROFILE_CERTIFICATE_PATH"
PROFILE_CERTIFICATE_SHA1="$(shasum -a 1 "$SIGNING_PROFILE_CERTIFICATE_PATH" | awk '{ print toupper($1) }')"
if [[ "$PROFILE_CERTIFICATE_SHA1" != "$SIGNING_IDENTITY_SHA1" ]]; then
  echo "The distribution profile does not contain the imported signing certificate." >&2
  exit 1
fi

PROFILES_DIRECTORY="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILES_DIRECTORY"
PROFILE_INSTALL_TARGET="$PROFILES_DIRECTORY/$PROFILE_UUID.mobileprovision"
if [[ -e "$PROFILE_INSTALL_TARGET" || -L "$PROFILE_INSTALL_TARGET" ]]; then
  if [[ ! -f "$PROFILE_INSTALL_TARGET" || -L "$PROFILE_INSTALL_TARGET" ]]; then
    echo "Refusing to replace a non-regular provisioning-profile path." >&2
    exit 1
  fi
  cp "$PROFILE_INSTALL_TARGET" "$INSTALLED_PROFILE_BACKUP_PATH"
  chmod 600 "$INSTALLED_PROFILE_BACKUP_PATH"
  RESTORE_INSTALLED_PROFILE=true
fi
INSTALLED_PROFILE_PATH="$PROFILE_INSTALL_TARGET"
cp "$SIGNING_PROFILE_PATH" "$INSTALLED_PROFILE_PATH"
chmod 600 "$INSTALLED_PROFILE_PATH"

# Validate the distribution contract before spending a runner on the archive.
beta_groups_json="$(
  run_asccli testflight groups list \
    --app-id "$ASC_APP_ID" \
    --limit 200 \
    --output json
)"
internal_group_count=0
external_group_count=0
for expected_group_id in "${beta_group_ids[@]}"; do
  found_group=false
  group_index=0
  while group_id="$(json_value "$beta_groups_json" "data.$group_index.id")"; do
    if [[ "$group_id" == "$expected_group_id" ]]; then
      found_group=true
      group_is_internal="$(json_value "$beta_groups_json" "data.$group_index.isInternalGroup")"
      case "$group_is_internal" in
        true) internal_group_count=$((internal_group_count + 1)) ;;
        false) external_group_count=$((external_group_count + 1)) ;;
        *)
          echo "TestFlight group $group_id has an invalid internal-group marker." >&2
          exit 1
          ;;
      esac
      break
    fi
    group_index=$((group_index + 1))
  done
  if [[ "$found_group" != true ]]; then
    echo "TestFlight beta group $expected_group_id does not belong to app $ASC_APP_ID." >&2
    exit 1
  fi
done

if [[ "$BETA_GROUP_POLICY" == one-internal-one-external ]] &&
  { [[ "$internal_group_count" -ne 1 ]] || [[ "$external_group_count" -ne 1 ]]; }; then
  echo "This release policy requires exactly one internal and one external TestFlight group." >&2
  exit 1
fi

if [[ -z "$BUILD_NUMBER" ]]; then
  BUILD_NUMBER="$(
    run_asccli builds next-number \
      --app-id "$ASC_APP_ID" \
      --version "$MARKETING_VERSION" \
      --platform ios \
      --output json |
      tr -d '[:space:]'
  )"
fi
if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "App Store Connect did not return a positive build number." >&2
  exit 1
fi

echo "Preparing $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) for TestFlight."

plutil -create xml1 "$EXPORT_OPTIONS_PATH"
plutil -insert method -string app-store-connect "$EXPORT_OPTIONS_PATH"
# Export locally rather than letting xcodebuild upload, so the
# distribution-signed artifact can be inspected before it is sent — and so the
# artifact that is inspected is the one that is sent.
plutil -insert destination -string export "$EXPORT_OPTIONS_PATH"
plutil -insert signingStyle -string manual "$EXPORT_OPTIONS_PATH"
plutil -insert signingCertificate -string "$SIGNING_IDENTITY_SHA1" "$EXPORT_OPTIONS_PATH"
plutil -insert provisioningProfiles -json "{\"$IOS_BUNDLE_ID\":\"$PROFILE_UUID\"}" "$EXPORT_OPTIONS_PATH"
plutil -insert teamID -string "$APPLE_TEAM_ID" "$EXPORT_OPTIONS_PATH"
plutil -insert distributionBundleIdentifier -string "$IOS_BUNDLE_ID" "$EXPORT_OPTIONS_PATH"
plutil -insert manageAppVersionAndBuildNumber -bool false "$EXPORT_OPTIONS_PATH"
# External groups cannot receive a build exported as internal-testing-only:
# App Store Connect hides it from the "Select a Build to Test" picker.
plutil -insert testFlightInternalTestingOnly -bool false "$EXPORT_OPTIONS_PATH"
plutil -insert uploadSymbols -bool true "$EXPORT_OPTIONS_PATH"

# Archive unsigned. Automatic signing needs a *development* identity to build
# with, and `-allowProvisioningUpdates` had Xcode create one through the App
# Store Connect API on every run, because a clean runner never has one. Those
# certificates are permanent and count against the shared team's quota, which
# they exhausted — eleven of them, until archiving failed for two projects at
# once with "Choose a certificate to revoke".
#
# Disabling signing is the only form of this that every target accepts.
# `CODE_SIGN_STYLE=Manual` with `PROVISIONING_PROFILE_SPECIFIER` applies to the
# Swift package targets too, and they reject a specified profile outright
# ("gRPC_opensslWrapper does not support provisioning profiles", and likewise
# for Firebase, GoogleUtilities, AppAuth, abseil, leveldb and nanopb).
#
# Nothing here needs a signature: `-exportArchive` below signs the product with
# the pinned distribution identity and profile. The archive is an intermediate;
# the exported IPA is what ships and what the distribution checks run against.
xcodebuild archive \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME_NAME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -clonedSourcePackagesDirPath "$SOURCE_PACKAGES_PATH" \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -hideShellScriptEnvironment \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  ${archive_build_settings[@]+"${archive_build_settings[@]}"}

ARCHIVED_APPLICATIONS_PATH="$ARCHIVE_PATH/Products/Applications"
archived_applications=()
while IFS= read -r application_path; do
  archived_applications+=("$application_path")
done < <(find "$ARCHIVED_APPLICATIONS_PATH" -maxdepth 1 -type d -name '*.app' -print)
if [[ "${#archived_applications[@]}" -ne 1 ]]; then
  echo "Expected exactly one archived iOS application; found ${#archived_applications[@]}." >&2
  exit 1
fi

ARCHIVED_APPLICATION_PATH="${archived_applications[0]}"
ARCHIVED_INFO_PLIST="$ARCHIVED_APPLICATION_PATH/Info.plist"
if [[ "$(plutil -extract CFBundleIdentifier raw -o - "$ARCHIVED_INFO_PLIST")" != "$IOS_BUNDLE_ID" ]]; then
  echo "Archived app does not carry the release bundle identifier." >&2
  exit 1
fi
if [[ "$(plutil -extract ITSAppUsesNonExemptEncryption raw -o - "$ARCHIVED_INFO_PLIST")" != false ]]; then
  echo "Archived app does not declare ITSAppUsesNonExemptEncryption=false." >&2
  exit 1
fi
if ! find "$ARCHIVED_APPLICATION_PATH" -name PrivacyInfo.xcprivacy -print -quit | grep -q .; then
  echo "Archived app contains no dependency privacy manifest." >&2
  exit 1
fi

# A release is the one build that leaves the runner. Refuse to ship one that
# carries a private key or a service account, however it got in.
unexpected_secret_file="$(find "$ARCHIVED_APPLICATION_PATH" -type f \( -name '*.p8' -o -name '*.p12' -o -name '*.pem' -o -name '*.key' -o -iname '*service-account*' -o -iname '*credentials*' \) -print -quit)"
unexpected_secret_content="$(grep -RIl --exclude='GoogleService-Info.plist' -E 'BEGIN ([A-Z]+ )?PRIVATE KEY|"type"[[:space:]]*:[[:space:]]*"service_account"' "$ARCHIVED_APPLICATION_PATH" 2>/dev/null | head -1 || true)"
if [[ -n "$unexpected_secret_file" || -n "$unexpected_secret_content" ]]; then
  echo "Archived app contains an unexpected private credential artifact." >&2
  exit 1
fi

# The caller's own assertions about its own app: which Firebase project is
# pinned, which purpose strings must be present, which environment was built.
# It sees the archived bundle and none of the release credentials.
if [[ -n "$VALIDATE_APP_SCRIPT_PATH" ]]; then
  echo "Validating the archived app with $VALIDATE_APP_SCRIPT."
  ( cd "$REPOSITORY_ROOT" &&
    run_without_release_secrets "$VALIDATE_APP_SCRIPT_PATH" "$ARCHIVED_APPLICATION_PATH" )
fi

# Xcode's exporter calls the system openrsync implementation with Apple-specific
# flags. Keep Homebrew rsync out of this child PATH so the two protocols cannot
# be mixed when a developer has installed a newer rsync globally.
#
# This is where the build gets signed, from the pinned identity and profile the
# export options name. `-allowProvisioningUpdates` is deliberately absent so the
# export cannot fall back to creating anything, and no App Store Connect key is
# passed: the upload is a separate, verifiable step below.
PATH=/usr/bin:/bin:/usr/sbin:/sbin /usr/bin/xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
  -exportPath "$EXPORT_DIRECTORY" \
  -hideShellScriptEnvironment

exported_ipas=()
while IFS= read -r ipa_path; do
  exported_ipas+=("$ipa_path")
done < <(find "$EXPORT_DIRECTORY" -maxdepth 1 -type f -name '*.ipa' -print)
if [[ "${#exported_ipas[@]}" -ne 1 ]]; then
  echo "Expected exactly one exported IPA; found ${#exported_ipas[@]}." >&2
  exit 1
fi
IPA_PATH="${exported_ipas[0]}"

# The distribution checks belong here, on the artifact that actually ships. The
# archive is deliberately unsigned, so asserting App Store entitlements against
# it can never pass — an earlier version of this check ran against the archive
# and failed every release for a reason that had nothing to do with the app.
mkdir -p "$IPA_CONTENTS_PATH"
/usr/bin/unzip -q "$IPA_PATH" -d "$IPA_CONTENTS_PATH"
exported_applications=()
while IFS= read -r application_path; do
  exported_applications+=("$application_path")
done < <(find "$IPA_CONTENTS_PATH/Payload" -maxdepth 1 -type d -name '*.app' -print)
if [[ "${#exported_applications[@]}" -ne 1 ]]; then
  echo "Expected exactly one application in the exported IPA; found ${#exported_applications[@]}." >&2
  exit 1
fi
EXPORTED_APPLICATION_PATH="${exported_applications[0]}"

if ! codesign --verify --strict "$EXPORTED_APPLICATION_PATH"; then
  echo "Exported app signature verification failed." >&2
  exit 1
fi

# Entitlement keys contain dots, which plutil reads as key-path separators;
# they are escaped below so the lookup addresses one key rather than four.
codesign -d --entitlements :- "$EXPORTED_APPLICATION_PATH" > "$EXPORTED_ENTITLEMENTS_PATH" 2>/dev/null
exported_application_identifier="$(plutil -extract application-identifier raw -o - "$EXPORTED_ENTITLEMENTS_PATH" 2>/dev/null || true)"
exported_team_identifier="$(plutil -extract 'com\.apple\.developer\.team-identifier' raw -o - "$EXPORTED_ENTITLEMENTS_PATH" 2>/dev/null || true)"
exported_get_task_allow="$(plutil -extract get-task-allow raw -o - "$EXPORTED_ENTITLEMENTS_PATH" 2>/dev/null || true)"
if [[ "$exported_application_identifier" != "$APPLE_TEAM_ID.$IOS_BUNDLE_ID" ]] ||
  [[ "$exported_team_identifier" != "$APPLE_TEAM_ID" ]] ||
  [[ "$exported_get_task_allow" == true ]]; then
  # Name the value that failed. This check blocked two release runs while
  # saying only that something did not match, which sent the investigation to
  # the entitlements rather than to the check itself both times.
  {
    echo "Exported app entitlements do not match App Store distribution."
    echo "  application-identifier: '$exported_application_identifier' (expected '$APPLE_TEAM_ID.$IOS_BUNDLE_ID')"
    echo "  team-identifier:        '$exported_team_identifier' (expected '$APPLE_TEAM_ID')"
    echo "  get-task-allow:         '$exported_get_task_allow' (expected absent or false)"
  } >&2
  exit 1
fi

echo "Uploading $SCHEME_NAME $MARKETING_VERSION ($BUILD_NUMBER) to App Store Connect."
upload_json="$(
  run_asccli builds upload \
    --app-id "$ASC_APP_ID" \
    --file "$IPA_PATH" \
    --version "$MARKETING_VERSION" \
    --build-number "$BUILD_NUMBER" \
    --platform ios \
    --output json
)"
printf '%s\n' "$upload_json"
upload_id="$(json_value "$upload_json" "data.0.id" || json_value "$upload_json" "data.id" || true)"
if [[ -z "$upload_id" ]]; then
  echo "App Store Connect accepted the upload command without returning an upload id." >&2
  exit 1
fi

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
