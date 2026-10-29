#!/bin/bash
# tests/integration.sh — synthetic integration tests for the rendered CD V2 host wrappers.
#
# Builds a fake runtime checkout with the CLI at the REAL dist/cli/index.js
# path, a fake credential EXEC wrapper, and paths containing spaces; renders the
# actual source templates and executes the GENERATED wrappers as subprocesses.
# Only synthetic values; no network, credentials, installs or repository access.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$REPO_ROOT/src/cd/host/macos"
T="$(mktemp -d "${TMPDIR:-/tmp}/cdv2-test.XXXXXX")"
trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
SECRET="synthetic-secret-value-never-print-123"
ok()   { PASS=$((PASS+1)); printf 'PASS: %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL: %s\n' "$1"; }
check()    { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected [$3], got [$2])"; fi; }
checkfile() { if grep -qFs -- "$2" "$3" 2>/dev/null; then bad "$1"; else ok "$1"; fi; }

# ---------- synthetic fixtures (paths deliberately contain spaces) ----------
RT="$T/Morpheus runtime"; SRC="$T/Consumer source"; CREDS="$T/My creds"
CAP="$T/capture"; mkdir -p "$CAP" "$RT/dist/cli" "$SRC/.morpheus" "$CREDS" "$T/logs"
CFG="$SRC/.morpheus/cd.json"
TOOLS="$T/Reviewed tools"; mkdir -p "$TOOLS"
NODE_DIR="$(dirname "$(node -p 'process.execPath')")"
EXEC_PATH="$TOOLS:$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
cat > "$TOOLS/gh" <<'EOF'
#!/bin/bash
printf 'synthetic-gh\n'
EOF
chmod +x "$TOOLS/gh"
printf '{"mode":"observe","synthetic":true}\n' > "$CFG"
printf 'source file\n' > "$SRC/app.txt"

# Fake controller CLI AT THE REAL PATH dist/cli/index.js. Records exact argv,
# refuses anything lacking an explicit --source-dir/--config, never prints the secret.
cat > "$RT/dist/cli/index.js" <<'EOF'
#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const out = process.env.CD_V2_TEST_CAPTURE_DIR;
const args = process.argv.slice(2), cmd = args[1];
const fail = (message, code) => { console.error(message); process.exit(code); };
fs.writeFileSync(`${out}/argv.txt`, `${args.join("\n")}\n`);
if (args[0] !== "cd" || !["tick", "worker"].includes(cmd)) fail("cli: expected cd tick|worker", 96);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : "";
const sd = value("--source-dir"), cfg = value("--config");
if (!sd || !cfg) fail("cli: REFUSING without explicit --source-dir and --config", 97);
if (!fs.statSync(sd).isDirectory() || !fs.statSync(cfg).isFile()) fail("cli: invalid source/config", 95);
fs.writeFileSync(`${out}/env.txt`, process.env.CD_V2_TEST_SECRET ? "secret=present\n" : "secret=absent\n");
fs.writeFileSync(`${out}/gh.txt`, execFileSync("gh", ["--version"], { encoding: "utf8" }));
console.log(JSON.stringify({ ok: true, command: cmd }));
EOF
chmod +x "$RT/dist/cli/index.js"

# Fake credential EXEC wrapper: loads VALUES into its env, execs "$@" as child.
cat > "$CREDS/credential exec wrapper.sh" <<EOF
#!/bin/bash
set -euo pipefail
export CD_V2_TEST_SECRET="$SECRET"
: > "\${CD_V2_TEST_CAPTURE_DIR:?capture dir missing}/credential-wrapper.txt"
exec "\$@"
EOF
chmod +x "$CREDS/credential exec wrapper.sh"
WRAP="$CREDS/credential exec wrapper.sh"
RTD="sha256:$(shasum -a 256 "$RT/dist/cli/index.js" | cut -d' ' -f1)"
CFGD="sha256:$(shasum -a 256 "$CFG" | cut -d' ' -f1)"

# ---------- renderer: generate real wrappers from the actual templates ----------
render() { # render <dest> <configDigest> <runtimeDigest> <tick|worker...>
  local dest="$1" cfgd="$2" rtd="$3"; shift 3
  mkdir -p "$dest"
  sed \
    -e "s|^CD_V2_CONFIG_PATH=.*|CD_V2_CONFIG_PATH='$CFG'|" \
    -e "s|^CD_V2_SOURCE_DIR=.*|CD_V2_SOURCE_DIR='$SRC'|" \
    -e "s|^CD_V2_RUNTIME_DIR=.*|CD_V2_RUNTIME_DIR='$RT'|" \
    -e "s|^CD_V2_RUNTIME_DIGEST=.*|CD_V2_RUNTIME_DIGEST='$rtd'|" \
    -e "s|^CD_V2_CONFIG_DIGEST=.*|CD_V2_CONFIG_DIGEST='$cfgd'|" \
    -e "s|^CD_V2_CRED_WRAPPER=.*|CD_V2_CRED_WRAPPER='$WRAP'|" \
    -e "s|^CD_V2_EXEC_PATH=.*|CD_V2_EXEC_PATH='$EXEC_PATH'|" \
    "$ROOT/cd-v2-common.sh.template" > "$dest/cd-v2-common.sh"
  for s in "$@"; do
    sed "s|cd-v2-common.sh.template|cd-v2-common.sh|" "$ROOT/cd-v2-$s.sh.template" > "$dest/$s.sh"
    chmod +x "$dest/$s.sh"
  done
}
runwrap() { # runwrap <wrapper-path> <cap> <stdout> <stderr>; echoes rc
  ( PATH=/usr/bin:/bin:/usr/sbin:/sbin CD_V2_TEST_CAPTURE_DIR="$2" "$1" >"$3" 2>"$4" ); echo $?
}
expect_argv() { # expect_argv <file> <args...>
  local file="$1"; shift
  [ "$(cat "$file")" = "$(printf '%s\n' "$@")" ]
}
rewrite() { # rewrite <sed-expression> <file> — portable replacement without BSD/GNU sed -i differences
  local expression="$1" file="$2" tmp="$2.tmp" was_executable=0
  [ -x "$file" ] && was_executable=1
  sed "$expression" "$file" > "$tmp" || return 1
  [ "$was_executable" -eq 0 ] || chmod +x "$tmp"
  mv "$tmp" "$file"
}

GOOD="$T/Host Bin"; render "$GOOD" "$CFGD" "$RTD" tick worker

# ---------- 1. tick: exact argv; explicit --source-dir; spaces survive ------
rc="$(runwrap "$GOOD/tick.sh" "$CAP" "$T/logs/t.out" "$T/logs/t.err")"
check "tick wrapper exits 0" "$rc" "0"
expected="cd
tick
--config
$CFG
--source-dir
$SRC"
if expect_argv "$CAP/argv.txt" "$expected"; then
  ok "tick argv: cd tick --config and --source-dir explicit, spaces preserved"
else bad "tick argv (got: $(cat "$CAP/argv.txt"))"; fi
grep -q '"command":"tick"' "$T/logs/t.out" && ok "tick controller returned JSON" || bad "tick controller output"
check "credential secret available inside controller child only" "$(cat "$CAP/env.txt")" "secret=present"
check "reviewed PATH resolves gh subprocess with sparse inherited PATH" "$(cat "$CAP/gh.txt")" "synthetic-gh"
grep -q 'cd-v2-common:' "$T/logs/t.err" && bad "unexpected tick stderr" || ok "tick clean stderr"

# ---------- 2. observe=1 rendered constant adds --observe ---------------------
OBS="$T/Obs Bin"; render "$OBS" "$CFGD" "$RTD" tick
rewrite 's|^CD_V2_TICK_OBSERVE=.*|CD_V2_TICK_OBSERVE="1"|' "$OBS/cd-v2-common.sh"
rm -f "$CAP/argv.txt"; runwrap "$OBS/tick.sh" "$CAP" "/dev/null" "/dev/null" >/dev/null
grep -qx -- '--observe' "$CAP/argv.txt" && ok "observe=1 rendered constant adds --observe" || bad "observe=1 rendered constant adds --observe"

# ---------- 3. worker: exact argv, same explicit source-dir --------------------
rm -f "$CAP/argv.txt"
rc="$(runwrap "$GOOD/worker.sh" "$CAP" "$T/logs/w.out" "$T/logs/w.err")"
check "worker wrapper exits 0" "$rc" "0"
expectedw="cd
worker
--executor
local
--config
$CFG
--source-dir
$SRC"
if expect_argv "$CAP/argv.txt" "$expectedw"; then
  ok "worker argv: executor local + explicit --config/--source-dir"
else bad "worker argv (got: $(cat "$CAP/argv.txt"))"; fi
grep -q '"command":"worker"' "$T/logs/w.out" && ok "worker controller JSON present" || bad "worker controller JSON present"

# ---------- 4. secret present in child env, never emitted anywhere ----------
checkfile "secret not in tick stdout" "$SECRET" "$T/logs/t.out"
checkfile "secret not in tick stderr" "$SECRET" "$T/logs/t.err"
checkfile "secret not in worker stdout" "$SECRET" "$T/logs/w.out"
checkfile "secret not in worker stderr" "$SECRET" "$T/logs/w.err"
checkfile "secret not in controller JSON output" "$SECRET" "$T/logs/t.out"
if [ -n "$(grep -rF "$SECRET" "$T" 2>/dev/null | grep -vF "credential exec wrapper.sh" || true)" ]; then
  bad "secret leaked nowhere else in test tree"
else ok "secret leaked nowhere else in test tree"; fi

# ---------- 5. placeholder template refuses to execute -------------------------
PH="$T/cap-placeholder"; PLH="$T/Placeholder Bin"; mkdir -p "$PH" "$PLH"
# Unrendered tick template: its sibling common is the STILL-PLACEHOLDER template.
  cp "$ROOT/cd-v2-common.sh.template" "$PLH/cd-v2-common.sh"
  sed "s|cd-v2-common.sh.template|cd-v2-common.sh|" "$ROOT/cd-v2-tick.sh.template" > "$PLH/tick.sh"
( CD_V2_TEST_CAPTURE_DIR="$PH" bash "$PLH/tick.sh" ) >"$T/logs/ph.out" 2>"$T/logs/ph.err"; rc=$?
[ "$rc" -ne 0 ] && ok "unrendered tick template refuses to run (exit $rc)" || bad "unrendered tick template ran"
grep -qs 'placeholder' "$T/logs/ph.err" && ok "failure names the unresolved placeholder" || bad "failure names the unresolved placeholder (err: $(cat "$T/logs/ph.err"))"
[ -e "$PH/argv.txt" ] && bad "controller never invoked from unrendered template" || ok "controller never invoked from unrendered template"

# ---------- 6/7. digest mismatch refuses BEFORE invoking the controller -------
for case in config runtime; do
  B="$T/Digest $case"; capd="$T/cap-$case"; mkdir -p "$capd"
  if [ "$case" = "config" ]; then
    render "$B" "sha256:0000000000000000000000000000000000000000000000000000000000000000" "$RTD" tick
  else
    render "$B" "$CFGD" "sha256:0000000000000000000000000000000000000000000000000000000000000000" tick
  fi
  rc="$(runwrap "$B/tick.sh" "$capd" "$T/logs/d-$case.out" "$T/logs/d-$case.err")"
  check "$case digest mismatch refuses, exit 2" "$rc" "2"
  grep -qs "$case digest.*!= pinned" "$T/logs/d-$case.err" && ok "$case digest mismatch reported" || bad "$case digest mismatch reported"
  [ -e "$capd/argv.txt" ] && bad "refused before invoking controller ($case)" || ok "refused before invoking controller ($case)"
done

# ---------- 8. NEGATIVE: original wrong path tooling/dist must fail closed ----
B="$T/Tooling Bug"; render "$B" "$CFGD" "$RTD" tick
rewrite 's|dist/cli/index.js|tooling/dist/cli/index.js|' "$B/cd-v2-common.sh"
rc="$(runwrap "$B/tick.sh" "$CAP" "$T/logs/tool.out" "$T/logs/tool.err")"
[ "$rc" -ne 0 ] && ok "tooling/dist/cli/index.js path fails closed (exit $rc)" || bad "tooling/dist path unexpectedly worked"
grep -qs 'tooling/dist/cli/index.js' "$T/logs/tool.err" && ok "error names the tooling/dist path" || bad "error names the tooling/dist path"
grep -qs 'cd-v2-common:' "$T/logs/tool.err" && ok "tooling/dist refusal happens before invocation" || bad "tooling/dist refusal happens before invocation"

# ---------- 9. NEGATIVE: omitted --source-dir is refused by the runtime -------
B="$T/No Source"; render "$B" "$CFGD" "$RTD" tick
rewrite 's| --source-dir "\$CD_V2_SOURCE_DIR"||g' "$B/tick.sh"
capn="$T/cap-nosrc"; mkdir -p "$capn"
rc="$(runwrap "$B/tick.sh" "$capn" "$T/logs/ns.out" "$T/logs/ns.err")"
check "runtime refuses tick without --source-dir (exit 97)" "$rc" "97"
grep -qs 'REFUSING' "$T/logs/ns.err" && ok "refusal is explicit (REFUSING without explicit --source-dir)" || bad "refusal is explicit"

# ---------- 10. source and runtime checkouts must be distinct -----------------
B="$T/Same Dir"; render "$B" "$CFGD" "$RTD" tick
rewrite "s|^CD_V2_SOURCE_DIR=.*|CD_V2_SOURCE_DIR='$RT'|" "$B/cd-v2-common.sh"
rc="$(runwrap "$B/tick.sh" "$T/cap-same" "$T/logs/sd.out" "$T/logs/sd.err")"
check "source==runtime checkout refused, exit 2" "$rc" "2"
grep -qs 'distinct' "$T/logs/sd.err" && ok "distinct checkout error reported" || bad "distinct checkout error reported"

# Physical identity must reject alternate spellings before credentials are loaded.
ln -s "$RT" "$T/Runtime alias"
for alias in "$RT/." "$RT/" "$T/Runtime alias"; do
  B="$T/Alias Bin"; render "$B" "$CFGD" "$RTD" tick
  rewrite "s|^CD_V2_SOURCE_DIR=.*|CD_V2_SOURCE_DIR='$alias'|" "$B/cd-v2-common.sh"
  capa="$T/cap-alias"; rm -rf "$capa"; mkdir -p "$capa"
  rc="$(runwrap "$B/tick.sh" "$capa" "$T/logs/alias.out" "$T/logs/alias.err")"
  check "source alias $alias refused" "$rc" "2"
  [ ! -e "$capa/credential-wrapper.txt" ] && ok "alias refused before credential wrapper" || bad "alias loaded credentials"
  [ ! -e "$capa/argv.txt" ] && ok "alias refused before controller" || bad "alias invoked controller"
done

for path in "" ".:/usr/bin" "/usr/bin:" "____:/usr/bin"; do
  B="$T/Path Bin"; render "$B" "$CFGD" "$RTD" tick
  rewrite "s|^CD_V2_EXEC_PATH=.*|CD_V2_EXEC_PATH='$path'|" "$B/cd-v2-common.sh"
  capp="$T/cap-path"; rm -rf "$capp"; mkdir -p "$capp"
  rc="$(runwrap "$B/tick.sh" "$capp" "$T/logs/path.out" "$T/logs/path.err")"
  check "unsafe executable PATH [$path] refused" "$rc" "2"
  [ ! -e "$capp/credential-wrapper.txt" ] && ok "unsafe PATH refused before credentials" || bad "unsafe PATH loaded credentials"
done

# ---------- 11. launchd templates: both auto-wake every 300 s ----------------
pl() {
  python3 -c 'import plistlib, sys; plistlib.load(open(sys.argv[1], "rb"))' "$1" >/dev/null 2>&1 \
    && echo ok || echo bad
}
check "tick plist lints" "$(pl "$ROOT/com.consumer.cd-v2-tick.plist.template")" "ok"
check "worker plist lints" "$(pl "$ROOT/com.consumer.cd-v2-worker.plist.template")" "ok"
grep -A1 'StartInterval' "$ROOT/com.consumer.cd-v2-tick.plist.template" | grep -q '300' \
  && ok "tick plist wakes automatically every 300 s" || bad "tick plist lacks 300 s StartInterval"
grep -A1 'StartInterval' "$ROOT/com.consumer.cd-v2-worker.plist.template" | grep -q '300' \
  && ok "worker plist wakes automatically every 300 s (self-healing)" || bad "worker plist lacks 300 s StartInterval"
ptype() {
  python3 -c 'import plistlib, sys; print(plistlib.load(open(sys.argv[1], "rb")).get("ProcessType", "<unset>"))' "$1" 2>/dev/null \
    || echo unreadable
}
# Adaptive/Background throttle the worker's quota handshake to failure (#558).
check "worker plist runs as an Interactive process" "$(ptype "$ROOT/com.consumer.cd-v2-worker.plist.template")" "Interactive"
check "tick template keeps its Background default" "$(ptype "$ROOT/com.consumer.cd-v2-tick.plist.template")" "Background"
for f in "$ROOT"/*.sh.template; do
  /bin/bash -n "$f" 2>/dev/null && ok "bash syntax: $(basename "$f")" || bad "bash syntax: $(basename "$f")"
done
for f in "$GOOD/tick.sh" "$GOOD/worker.sh" "$GOOD/cd-v2-common.sh"; do
  /bin/bash -n "$f" 2>/dev/null && ok "rendered bash syntax: $(basename "$f")" || bad "rendered bash syntax: $(basename "$f")"
done

printf '\nResults: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
