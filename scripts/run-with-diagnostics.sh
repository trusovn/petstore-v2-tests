#!/usr/bin/env bash
# Run a Maven verification target and capture a diagnostics bundle on failure.
#
# Usage: ./scripts/run-with-diagnostics.sh <maven args...>
#
# Records the run start time, runs Maven (output is teed to the terminal),
# and on a non-zero Maven exit code writes a bundle under
# target/failure-diagnostics/<timestamp>-<pid>/ containing:
#   - maven-console.log      Maven stdout/stderr transcript
#   - docker-compose.log     Container logs windowed to the run (--since)
#   - container-state.txt    Compose status (incl. exited) + docker inspect fields
#   - access-logs/            Only the Jetty access-log bytes appended during the run
#
# The effective base URI is resolved the same way as ConfigLoader:
# JVM property petstore.baseUri (-Dpetstore.baseUri=...) > env PETSTORE_BASE_URI
# > application.config.yaml default (localhost, treated as local). Docker and
# access-log collection is best-effort and local-only: it is skipped for
# non-local targets so external runs do not attach unrelated local container
# logs. Maven's exit code is preserved.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

RUN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TS_DIR="$(date +%Y%m%d-%H%M%S)-$$"
ACCESS_LOG_DIR="${PETSTORE_ACCESS_LOG_DIR:-${REPO_ROOT}/.runtime/petstore-logs/access}"

CONSOLE_LOG="$(mktemp)"
ACCESS_SNAPSHOT="$(mktemp)"
cleanup() { rm -f "${CONSOLE_LOG}" "${ACCESS_SNAPSHOT}"; }
trap cleanup EXIT

# Effective base URI, mirroring ConfigLoader.effectiveBaseUri precedence:
# -Dpetstore.baseUri=... > PETSTORE_BASE_URI env > (unset → yaml default = local).
effective_base_uri() {
    local arg val
    for arg in "$@"; do
        case "${arg}" in
            -Dpetstore.baseUri=*)
                val="${arg#-Dpetstore.baseUri=}"
                if [[ "${val}" =~ [^[:space:]] ]]; then printf '%s' "${val}"; return 0; fi
                ;;
        esac
    done
    if [[ "${PETSTORE_BASE_URI:-}" =~ [^[:space:]] ]]; then
        printf '%s' "${PETSTORE_BASE_URI}"; return 0
    fi
    return 1
}

# Extract the host component from a URI for a strict local-host check.
host_of() {
    local h="$1"
    h="${h#*://}"      # drop scheme
    h="${h%%/*}"       # drop path
    h="${h##*@}"       # drop userinfo
    h="${h%%:*}"       # drop port
    h="${h#[}"; h="${h%]}"   # drop IPv6 brackets
    printf '%s' "${h}"
}

is_local_host() {
    case "$1" in
        localhost|127.0.0.1|0.0.0.0|::1) return 0 ;;
        *) return 1 ;;
    esac
}

EFFECTIVE_URI="$(effective_base_uri "$@" || true)"
if [[ -z "${EFFECTIVE_URI}" ]]; then
    local_run=true
elif is_local_host "$(host_of "${EFFECTIVE_URI}")"; then
    local_run=true
else
    local_run=false
fi

# Snapshot access-log file sizes before Maven runs so that, on failure, only
# bytes appended during this run are captured (not the long-lived log history).
if [[ "${local_run}" == true && -d "${ACCESS_LOG_DIR}" ]]; then
    (
        cd "${ACCESS_LOG_DIR}" || exit 0
        for f in *; do
            [[ -f "$f" ]] || continue
            printf '%s\t%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')"
        done
    ) > "${ACCESS_SNAPSHOT}" 2>/dev/null || true
fi

set +e
if [[ -t 1 ]]; then
    set -- -Dstyle.color=always "$@"
fi
mvn "$@" 2>&1 | tee "${CONSOLE_LOG}"
mvn_status=${PIPESTATUS[0]}
set -e

if [[ "${mvn_status}" -eq 0 ]]; then
    exit 0
fi

BUNDLE_DIR="${REPO_ROOT}/target/failure-diagnostics/${TS_DIR}"
mkdir -p "${BUNDLE_DIR}/access-logs"
LC_ALL=C sed $'s/\033\\[[0-9;]*m//g' "${CONSOLE_LOG}" \
    > "${BUNDLE_DIR}/maven-console.log"

# Copy only the access-log bytes appended after the run-start snapshot.
# New files (created during the run) are copied whole; truncated/rotated
# files fall back to a full copy.
collect_access_logs() {
    [[ -d "${ACCESS_LOG_DIR}" ]] || return 0
    local f base cur prev
    for f in "${ACCESS_LOG_DIR}"/*; do
        [[ -f "$f" ]] || continue
        base="${f##*/}"
        prev="$(awk -F'\t' -v n="${base}" '$1==n{print $2; exit}' "${ACCESS_SNAPSHOT}" 2>/dev/null || true)"
        if [[ -z "${prev}" ]]; then
            cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>/dev/null || true
            continue
        fi
        cur="$(wc -c < "$f" | tr -d ' ')" || { cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>/dev/null || true; continue; }
        if [[ "${cur}" -gt "${prev}" ]]; then
            tail -c "+$((prev + 1))" "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>/dev/null || true
        elif [[ "${cur}" -lt "${prev}" ]]; then
            cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>/dev/null || true
        fi
        # cur == prev: nothing appended during the run → skip
    done
}

if [[ "${local_run}" == true ]]; then
    {
        echo "=== docker compose ps --all ==="
        docker compose ps --all 2>&1 || true
        echo
        echo "=== docker inspect (selected fields) ==="
        cid="$(docker compose ps --all -q petstore 2>/dev/null || true)"
        if [[ -n "${cid}" ]]; then
            docker inspect --format \
                'Image: {{.Image}}
StartedAt: {{.State.StartedAt}}
ExitCode: {{.State.ExitCode}}
OOMKilled: {{.State.OOMKilled}}
RestartCount: {{.RestartCount}}
Status: {{.State.Status}}' ${cid} 2>&1 || true
        else
            echo "No petstore container found (running or exited)."
        fi
    } > "${BUNDLE_DIR}/container-state.txt"

    docker compose logs --since "${RUN_START}" --timestamps --no-color petstore \
        > "${BUNDLE_DIR}/docker-compose.log" 2>&1 || true

    collect_access_logs
else
    printf 'Effective base URI: %s (non-local); Docker and access-log diagnostics skipped.\n' \
        "${EFFECTIVE_URI}" > "${BUNDLE_DIR}/docker-diagnostics-skipped.txt"
fi

{
    echo "Failure diagnostics bundle"
    echo "Run start: ${RUN_START}"
    echo "Effective base URI: ${EFFECTIVE_URI:-<default localhost>}"
    echo "Local run: ${local_run}"
    echo "Maven exit code: ${mvn_status}"
    echo
    echo "Contents:"
    (cd "${BUNDLE_DIR}" && find . -type f | sort)
} > "${BUNDLE_DIR}/README.txt"

printf '\nMaven failed (exit %s). Diagnostics bundle written to %s\n' \
    "${mvn_status}" "${BUNDLE_DIR}" >&2

exit "${mvn_status}"
