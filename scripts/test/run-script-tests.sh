#!/usr/bin/env bash
# Deterministic tests for the Petstore runtime-context resolver. Uses an
# isolated subshell; no real Maven/Docker/Petstore is required.
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${HERE}/../.." && pwd)"
PASS=0; FAIL=0

ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

assert_eq() { local name="$1" exp="$2" act="$3"; if [[ "$exp" == "$act" ]]; then ok "$name"; else bad "$name (expected [$exp] got [$act])"; fi; }
assert_contains() { local name="$1" hay="$2" needle="$3"; if [[ "$hay" == *"$needle"* ]]; then ok "$name"; else bad "$name (missing [$needle])"; fi; }

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
          PETSTORE_ACCESS_LOG_DIR PETSTORE_CONTEXT_RESOLVED
    eval "$1" 2>/dev/null
    . "$resolver" || { echo "RESOLVE_RC=$?"; exit 0; }
    printf 'TARGET=%s|PORT=%s|BASE_URI=%s|ACCESS_LOG_DIR=%s|RESOLVED=%s\n' \
        "${PETSTORE_TARGET:-}" "${PETSTORE_PORT:-}" \
        "${PETSTORE_BASE_URI:-}" "${PETSTORE_ACCESS_LOG_DIR:-}" \
        "${PETSTORE_CONTEXT_RESOLVED:-}"
); }

r="$(resolve "")"
assert_contains "C1-default-target" "$r" "TARGET=local-compose"
assert_contains "C1-default-uri" "$r" "BASE_URI=http://localhost:8080/v2"
assert_contains "C1-default-port" "$r" "PORT=8080"
assert_contains "C1-resolved" "$r" "RESOLVED=1"

r="$(resolve "PETSTORE_PORT=18080")"
assert_contains "C2-custom-port-uri" "$r" "BASE_URI=http://localhost:18080/v2"

r="$(resolve "PETSTORE_BASE_URI=http://localhost:8080/v2")"
assert_contains "C3-local-compose-rejects-baseuri" "$r" "RESOLVE_RC=1"

r="$(resolve "PETSTORE_TARGET=external")"
assert_contains "C4-external-requires-uri" "$r" "RESOLVE_RC=1"

r="$(resolve "PETSTORE_TARGET=external PETSTORE_BASE_URI=https://petstore.swagger.io/v2")"
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

echo
printf 'RESULTS: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
