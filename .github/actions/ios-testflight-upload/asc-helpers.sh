# Shared App Store Connect invocation and JSON lookups. Source from release scripts.
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

