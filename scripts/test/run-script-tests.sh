#!/usr/bin/env bash
# Deterministic tests for the Petstore runtime-context resolver and the
# failure-diagnostics wrapper. Uses fake mvn/docker commands and an isolated
# workspace; no real Maven/Docker/Petstore is required.
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${HERE}/../.." && pwd)"
PASS=0; FAIL=0

ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

assert_eq() { local name="$1" exp="$2" act="$3"; if [[ "$exp" == "$act" ]]; then ok "$name"; else bad "$name (expected [$exp] got [$act])"; fi; }
assert_contains() { local name="$1" hay="$2" needle="$3"; if [[ "$hay" == *"$needle"* ]]; then ok "$name"; else bad "$name (missing [$needle])"; fi; }
assert_file() { local name="$1" f="$2"; if [[ -f "$f" ]]; then ok "$name"; else bad "$name (missing $f)"; fi; }
assert_no_file() { local name="$1" f="$2"; if [[ ! -e "$f" ]]; then ok "$name"; else bad "$name (unexpected $f)"; fi; }

# ---------------------------------------------------------------------------
# Context resolver tests (scripts/petstore-context.sh)
# ---------------------------------------------------------------------------
echo "== petstore-context.sh =="
resolver="${REPO_ROOT}/scripts/petstore-context.sh"

# C1: executed directly -> usage error, exit 2
set +e; out="$("$resolver" 2>&1)"; rc=$?; set -e
assert_eq "executed-directly-exits-2" "2" "$rc"
assert_contains "executed-directly-message" "$out" "sourced"

# Helper: resolve in a clean subshell and print key vars.
resolve() { (
    unset PETSTORE_TARGET PETSTORE_PORT PETSTORE_BASE_URI \
          PETSTORE_ACCESS_LOG_DIR PETSTORE_DIAGNOSTICS_PROVIDER PETSTORE_CONTEXT_RESOLVED
    eval "$1" 2>/dev/null
    . "$resolver" || { echo "RESOLVE_RC=$?"; exit 0; }
    printf 'TARGET=%s|PORT=%s|BASE_URI=%s|ACCESS_LOG_DIR=%s|PROVIDER=%s|RESOLVED=%s\n' \
        "${PETSTORE_TARGET:-}" "${PETSTORE_PORT:-}" \
        "${PETSTORE_BASE_URI:-}" "${PETSTORE_ACCESS_LOG_DIR:-}" "${PETSTORE_DIAGNOSTICS_PROVIDER:-}" \
        "${PETSTORE_CONTEXT_RESOLVED:-}"
); }

r="$(resolve "")"
assert_contains "C1-default-target" "$r" "TARGET=local-compose"
assert_contains "C1-default-uri" "$r" "BASE_URI=http://localhost:8080/v2"
assert_contains "C1-default-provider" "$r" "PROVIDER=compose"
assert_contains "C1-default-port" "$r" "PORT=8080"
assert_contains "C1-resolved" "$r" "RESOLVED=1"

r="$(resolve "PETSTORE_PORT=18080")"
assert_contains "C2-custom-port-uri" "$r" "BASE_URI=http://localhost:18080/v2"

r="$(resolve "PETSTORE_BASE_URI=http://localhost:8080/v2")"
assert_contains "C3-local-compose-rejects-baseuri" "$r" "RESOLVE_RC=1"

r="$(resolve "PETSTORE_TARGET=external")"
assert_contains "C4-external-requires-uri" "$r" "RESOLVE_RC=1"

r="$(resolve "PETSTORE_TARGET=external PETSTORE_BASE_URI=https://petstore.swagger.io/v2")"
assert_contains "C5-external-provider-none" "$r" "PROVIDER=none"
assert_contains "C5-external-baseuri" "$r" "BASE_URI=https://petstore.swagger.io/v2"

r="$(resolve "PETSTORE_TARGET=bogus")"
assert_contains "C6-unknown-target" "$r" "RESOLVE_RC=1"

# C7: idempotent (second source is a no-op; values unchanged)
r="$(PETSTORE_PORT=19090 PETSTORE_RESOLVER="$resolver" bash -c '''. "$PETSTORE_RESOLVER"
first=$PETSTORE_BASE_URI
. "$PETSTORE_RESOLVER"
printf "%s %s\n" "$first" "$PETSTORE_BASE_URI"''')"
assert_contains "C7-idempotent" "$r" "http://localhost:19090/v2 http://localhost:19090/v2"

# C8: access log dir default ends under .runtime/petstore-logs/access
r="$(resolve "")"
assert_contains "C8-accesslog-default" "$r" "ACCESS_LOG_DIR=" # present; check value via env capture below
acc="$(unset PETSTORE_ACCESS_LOG_DIR PETSTORE_CONTEXT_RESOLVED PETSTORE_TARGET; . "$resolver"; printf '%s' "$PETSTORE_ACCESS_LOG_DIR")"
assert_contains "C8-accesslog-value" "$acc" ".runtime/petstore-logs/access"

# ---------------------------------------------------------------------------
# Diagnostics wrapper tests (scripts/run-with-diagnostics.sh)
# ---------------------------------------------------------------------------
echo "== run-with-diagnostics.sh =="

# Build an isolated workspace that mirrors the repo layout used by the script.
WRK="$(mktemp -d)"
trap 'rm -rf "$WRK"' EXIT
mkdir -p "$WRK/scripts" "$WRK/target" "$WRK/bin"

cp "${REPO_ROOT}/scripts/run-with-diagnostics.sh" "$WRK/scripts/run-with-diagnostics.sh"
cp "${REPO_ROOT}/scripts/petstore-context.sh" "$WRK/scripts/petstore-context.sh"
chmod +x "$WRK/scripts/run-with-diagnostics.sh"

# Fake mvn: writes current-run surefire + allure artifacts, prints a failure,
# appends access-log bytes when given a dir, and exits with a chosen code.
# Supports `--version`.
cat > "$WRK/bin/mvn" <<'MVN'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
    echo "Apache Maven 3.9.9 (fake)"
    exit 0
fi
# marker that real mvn was invoked
touch "$(pwd)/.mvn-was-invoked"
SUITE_DIR="$(pwd)/target/surefire-reports/regular"
ALR_DIR="$(pwd)/target/allure-results/regular"
mkdir -p "$SUITE_DIR" "$ALR_DIR"
# surefire XML with a failing test
cat > "$SUITE_DIR/TEST-org.mtrusov.tests.DemoTests.xml" <<'XML'
<testsuite name="DemoTests" tests="1" failures="1" errors="0" skipped="0">
<testcase name="demoTest()" classname="org.mtrusov.tests.DemoTests"><failure message="">boom</failure></testcase>
</testsuite>
XML
echo "DemoTests.txt content" > "$SUITE_DIR/org.mtrusov.tests.DemoTests.txt"
# allure result referencing one present and one MISSING attachment
GOOD="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-attachment.html"
MISS="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb-attachment.html"
printf '{"name":"demoTest()","status":"failed","attachments":[{"name":"Request","source":"%s","type":"text/html"},{"name":"Request","source":"%s","type":"text/html"}]}' "$GOOD" "$MISS" \
    > "$ALR_DIR/cccccccc-cccc-cccc-cccc-cccccccccccc-result.json"
echo "<html>good</html>" > "$ALR_DIR/$GOOD"
# (MISS deliberately not created -> dangling reference)
echo "BUILD FAILURE (fake)"
exit 7
MVN
chmod +x "$WRK/bin/mvn"

# Fake docker: canned responses for compose subcommands.
cat > "$WRK/bin/docker" <<'DK'
#!/usr/bin/env bash
case "${1:-}" in
  compose)
    case "${2:-}" in
      ps)
        printf 'compose ps: %s\n' "$*" >> "$(pwd)/.docker-ps-calls"
        if [[ "$*" == *"-q"* ]]; then
          # Running-only (-q) is empty to model a crashed/stopped container;
          # --all -q returns the exited container id.
          if [[ "$*" == *"--all"* ]]; then echo "deadbeefcafe"; else echo ""; fi
        else
          echo "NAME                STATUS"
          echo "petstore            Exited (137) 1 minute ago"
        fi;;
      logs) echo "[fake] petstore log line";;
    esac;;
  inspect)
    if [[ "$*" == *".Config.Image"* && "$*" != *"StartedAt"* ]]; then
      echo "swaggerapi/petstore:1.0.7"
    else
      echo "Image: swaggerapi/petstore:1.0.7"
      echo "ImageId: sha256:abcdef"
      echo "StartedAt: 2026-07-03T14:00:00Z"
      echo "ExitCode: 0"
      echo "OOMKilled: false"
      echo "RestartCount: 0"
      echo "Status: running"
    fi;;
esac
exit 0
DK
chmod +x "$WRK/bin/docker"

# Fake java for version line.
cat > "$WRK/bin/java" <<'JV'
#!/usr/bin/env bash
echo "openjdk version 25 (fake)"
JV
chmod +x "$WRK/bin/java"

run_diag() { (
    cd "$WRK"
    PATH="$WRK/bin:$PATH" "$@" 2>&1
    echo "EXIT_CODE=$?"
); }

BUNDLE_BASE="$WRK/target/failure-diagnostics"

# D1: exit code preserved (compose provider, code 7)
out="$(run_diag env PETSTORE_DIAGNOSTICS_PROVIDER=compose PETSTORE_ACCESS_LOG_DIR="$WRK/access" \
    PETSTORE_TARGET=local-compose \
    PETSTORE_BASE_URI=http://localhost:8080/v2 \
    "$WRK/scripts/run-with-diagnostics.sh" verify -DskipLocalTests=true)"
assert_contains "D1-exit-preserved" "$out" "EXIT_CODE=7"

# determine bundle dir
bd="$(find "$BUNDLE_BASE" -maxdepth 1 -mindepth 1 -type d | head -1)"
assert_file "D1-maven-console" "$bd/maven-console.log"
assert_file "D1-manifest" "$bd/manifest.json"
assert_file "D1-collector-errors" "$bd/collector-errors.log"
assert_file "D1-docker-compose-log" "$bd/docker-compose.log"
assert_file "D1-container-state" "$bd/container-state.txt"
assert_file "D1-surefire-xml" "$bd/surefire-reports/regular/TEST-org.mtrusov.tests.DemoTests.xml"
assert_file "D1-allure-result" "$bd/allure-results/regular/cccccccc-cccc-cccc-cccc-cccccccccccc-result.json"
assert_file "D1-allure-good-attachment" "$bd/allure-results/regular/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-attachment.html"
assert_no_file "D1-allure-missing-attachment-not-copied" "$bd/allure-results/regular/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb-attachment.html"

# manifest content
mj="$bd/manifest.json"
assert_eq "D1-manifest-mavenExit" "7" "$(jq -r '.mavenExitCode' "$mj")"
assert_eq "D1-manifest-provider" "compose" "$(jq -r '.target.diagnosticsProvider' "$mj")"
assert_eq "D1-manifest-target" "local-compose" "$(jq -r '.target.type' "$mj")"
assert_eq "D1-manifest-baseuri" "http://localhost:8080/v2" "$(jq -r '.target.baseUri' "$mj")"
assert_eq "D1-manifest-goal" "verify" "$(jq -r '.maven.goal' "$mj")"
assert_eq "D1-manifest-skipLocal" "true" "$(jq -r '.maven.suiteSelection.skipLocal' "$mj")"
assert_contains "D1-manifest-failed-test" "$(jq -r '.results.failedTests[]' "$mj")" "demoTest()"
assert_eq "D1-manifest-failed-count" "1" "$(jq -r '.results.failedTestCount' "$mj")"
assert_contains "D1-integrity-warning" "$(jq -r '.warnings.integrity[]' "$mj")" "missing attachment"
assert_contains "D1-integrity-names-missing-source" "$(jq -r '.warnings.integrity[]' "$mj")" "bbbbbbbb"
assert_contains "D1-collector-has-integrity" "$(cat "$bd/collector-errors.log")" "[integrity]"
assert_contains "D1-container-state-has-image" "$(cat "$bd/container-state.txt")" "Image: swaggerapi/petstore:1.0.7"
assert_eq "D1-manifest-container-id" "deadbeefcafe" "$(jq -r '.sut.composeContainerId' "$mj")"
assert_eq "D1-manifest-container-image" "swaggerapi/petstore:1.0.7" "$(jq -r '.sut.composeImage' "$mj")"
assert_contains "D1-uses-all-ps" "$(cat "$WRK/.docker-ps-calls")" "--all"

# D2: provider=none -> no compose/access artifacts, skipped note, exit 7
rm -rf "$BUNDLE_BASE"
out="$(run_diag env PETSTORE_DIAGNOSTICS_PROVIDER=none PETSTORE_TARGET=external \
    PETSTORE_BASE_URI=https://petstore.swagger.io/v2 \
    "$WRK/scripts/run-with-diagnostics.sh" verify -DskipLocalTests=true)"
assert_contains "D2-exit-preserved" "$out" "EXIT_CODE=7"
bd="$(find "$BUNDLE_BASE" -maxdepth 1 -mindepth 1 -type d | head -1)"
assert_no_file "D2-no-docker-log" "$bd/docker-compose.log"
assert_no_file "D2-no-container-state" "$bd/container-state.txt"
assert_file "D2-skipped-note" "$bd/diagnostics-skipped.txt"
assert_eq "D2-manifest-provider" "none" "$(jq -r '.target.diagnosticsProvider' "$bd/manifest.json")"
assert_eq "D2-manifest-baseuri" "https://petstore.swagger.io/v2" "$(jq -r '.target.baseUri' "$bd/manifest.json")"

# D3: provider unset -> fail fast (exit 2), mvn never invoked
rm -rf "$BUNDLE_BASE" "$WRK/.mvn-was-invoked"
out="$(run_diag env -u PETSTORE_DIAGNOSTICS_PROVIDER \
    "$WRK/scripts/run-with-diagnostics.sh" verify)"
assert_contains "D3-unset-provider-exit2" "$out" "EXIT_CODE=2"
assert_no_file "D3-no-mvn-invoked" "$WRK/.mvn-was-invoked"

# D4: success path -> exit 0, no bundle
rm -rf "$BUNDLE_BASE" "$WRK/.mvn-was-invoked"
cat > "$WRK/bin/mvn" <<'MVN'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "Apache Maven 3.9.9 (fake)"; exit 0; fi
touch "$(pwd)/.mvn-was-invoked"
echo "BUILD SUCCESS (fake)"
exit 0
MVN
chmod +x "$WRK/bin/mvn"
out="$(run_diag env PETSTORE_DIAGNOSTICS_PROVIDER=compose PETSTORE_ACCESS_LOG_DIR="$WRK/access" \
    PETSTORE_TARGET=local-compose \
    PETSTORE_BASE_URI=http://localhost:8080/v2 \
    "$WRK/scripts/run-with-diagnostics.sh" verify -DskipLocalTests=true)"
assert_contains "D4-success-exit0" "$out" "EXIT_CODE=0"
assert_no_file "D4-no-bundle" "$BUNDLE_BASE"

# D5: collection failure (missing access dir) does not mask exit code
rm -rf "$BUNDLE_BASE" "$WRK/.mvn-was-invoked"
cat > "$WRK/bin/mvn" <<'MVN'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "Apache Maven 3.9.9 (fake)"; exit 0; fi
mkdir -p "$(pwd)/target/surefire-reports/regular" "$(pwd)/target/allure-results/regular"
echo "x" > "$(pwd)/target/surefire-reports/regular/TEST-A.xml"
echo "BUILD FAILURE (fake2)"
exit 5
MVN
chmod +x "$WRK/bin/mvn"
out="$(run_diag env PETSTORE_DIAGNOSTICS_PROVIDER=compose PETSTORE_ACCESS_LOG_DIR="$WRK/nonexistent-access" \
    PETSTORE_TARGET=local-compose \
    PETSTORE_BASE_URI=http://localhost:8080/v2 \
    "$WRK/scripts/run-with-diagnostics.sh" verify)"
assert_contains "D5-exit-preserved-despite-collection-issue" "$out" "EXIT_CODE=5"

# D6: stale (previous-run) artifacts are not misattributed to a fresh failure.
# Pre-existing allure/surefire files get an old mtime; the failing fake mvn
# writes no current-run artifacts, so the bundle must contain none of them.
rm -rf "$BUNDLE_BASE" "$WRK/.mvn-was-invoked" "$WRK/.docker-ps-calls"
rm -rf "$WRK/target/allure-results" "$WRK/target/surefire-reports"
mkdir -p "$WRK/target/allure-results/regular" "$WRK/target/surefire-reports/regular"
printf '{"name":"staleTest()","status":"passed","attachments":[{"source":"stale-att.html"}]}' \
    > "$WRK/target/allure-results/regular/stale-result.json"
echo "<html>stale</html>" > "$WRK/target/allure-results/regular/stale-att.html"
echo "<testsuite/>" > "$WRK/target/surefire-reports/regular/TEST-org.mtrusov.tests.Stale.xml"
touch -t 202001010000 "$WRK/target/allure-results/regular/stale-result.json" \
    "$WRK/target/allure-results/regular/stale-att.html" \
    "$WRK/target/surefire-reports/regular/TEST-org.mtrusov.tests.Stale.xml"
cat > "$WRK/bin/mvn" <<'MVN'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "Apache Maven 3.9.9 (fake)"; exit 0; fi
touch "$(pwd)/.mvn-was-invoked"
echo "BUILD FAILURE (no new artifacts)"
exit 9
MVN
chmod +x "$WRK/bin/mvn"
out="$(run_diag env PETSTORE_DIAGNOSTICS_PROVIDER=none PETSTORE_TARGET=external \
    PETSTORE_BASE_URI=https://x.example/v2 \
    "$WRK/scripts/run-with-diagnostics.sh" verify -DskipLocalTests=true)"
assert_contains "D6-exit-preserved" "$out" "EXIT_CODE=9"
bd="$(find "$BUNDLE_BASE" -maxdepth 1 -mindepth 1 -type d | head -1)"
assert_no_file "D6-no-stale-allure-result" "$bd/allure-results/regular/stale-result.json"
assert_no_file "D6-no-stale-allure-attachment" "$bd/allure-results/regular/stale-att.html"
assert_no_file "D6-no-stale-surefire" "$bd/surefire-reports/regular/TEST-org.mtrusov.tests.Stale.xml"
assert_eq "D6-manifest-failedTests-empty" "[]" "$(jq -c '.results.failedTests' "$bd/manifest.json")"
assert_eq "D6-manifest-mavenExit" "9" "$(jq -r '.mavenExitCode' "$bd/manifest.json")"

echo
printf 'RESULTS: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
