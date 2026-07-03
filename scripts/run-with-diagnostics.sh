#!/usr/bin/env bash
# Run a Maven verification target and capture a self-contained diagnostics
# bundle on failure.
#
# Usage: ./scripts/run-with-diagnostics.sh <maven args...>
#
# This script is a pure consumer of the runtime context resolved by the
# orchestration layer (Make sources scripts/petstore-context.sh, which exports
# PETSTORE_TARGET, PETSTORE_BASE_URI, PETSTORE_ACCESS_LOG_DIR,
# PETSTORE_DIAGNOSTICS_PROVIDER). It does not
# infer the target or diagnostics ownership from the base URI.
#
# Requires PETSTORE_DIAGNOSTICS_PROVIDER to be set (compose|none). On a non-zero
# Maven exit it writes a bundle under
# target/failure-diagnostics/<timestamp>-<pid>/ containing:
#   - manifest.json             compact machine-readable run manifest
#   - maven-console.log          Maven stdout/stderr transcript
#   - surefire-reports/          current-run Surefire XML/text + *.dump[stream]
#   - allure-results/            current-run Allure JSON, containers, attachments
#   - docker-compose.log         container logs windowed to the run (compose only)
#   - container-state.txt        Compose status + selected inspect fields (compose only)
#   - access-logs/               access-log bytes appended during the run (compose only)
#   - collector-errors.log       best-effort collection + integrity warnings
#
# Collection is best-effort: no collection step (mkdir, sed, redirects, manifest
# creation, Docker calls, or artifact copying) may replace Maven's exit code.
# Maven's original status is always returned.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [[ ! "${PETSTORE_DIAGNOSTICS_PROVIDER:-}" =~ ^(compose|none)$ ]]; then
    printf 'PETSTORE_DIAGNOSTICS_PROVIDER must be set to compose|none (run via make verify, or source scripts/petstore-context.sh first).\n' >&2
    exit 2
fi

PROVIDER="${PETSTORE_DIAGNOSTICS_PROVIDER}"
ACCESS_LOG_DIR="${PETSTORE_ACCESS_LOG_DIR:-}"
COMPOSE_SERVICE="petstore"
BASE_URI="${PETSTORE_BASE_URI:-}"
TARGET="${PETSTORE_TARGET:-}"

RUN_START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_START_EPOCH="$(date +%s)"
TS_DIR="$(date +%Y%m%d-%H%M%S)-$$"

CONSOLE_LOG="$(mktemp)"; ACCESS_SNAPSHOT="$(mktemp)"
MARKER="${REPO_ROOT}/target/.diag-marker-${TS_DIR}"
COLLECTOR_ERRORS=""; COLLECTOR_WARNINGS="$(mktemp)"; INTEGRITY_WARNINGS="$(mktemp)"
: > "${COLLECTOR_WARNINGS}"; : > "${INTEGRITY_WARNINGS}"
cleanup() { rm -f "${CONSOLE_LOG}" "${ACCESS_SNAPSHOT}" "${COLLECTOR_WARNINGS}" "${INTEGRITY_WARNINGS}" "${MARKER}" 2>/dev/null || true; }
trap cleanup EXIT

# Parse the managed Maven invocation for the manifest (goal + suite selection).
MAVEN_GOAL=""
SKIP_LOCAL=false; SKIP_REGULAR=false; SKIP_QUARANTINE=false
for a in "$@"; do
    case "$a" in
        -DskipLocalTests=true) SKIP_LOCAL=true;;
        -DskipRegularTests=true) SKIP_REGULAR=true;;
        -DskipQuarantineTests=true) SKIP_QUARANTINE=true;;
        -*) ;; # option/property or flag: not the goal
        *) [[ -z "$MAVEN_GOAL" ]] && MAVEN_GOAL="$a";;
    esac
done

mkdir -p "${REPO_ROOT}/target"
touch "${MARKER}"

# Snapshot access-log file sizes before Maven runs so that, on failure, only
# bytes appended during this run are captured.
if [[ "${PROVIDER}" == "compose" && -n "${ACCESS_LOG_DIR}" && -d "${ACCESS_LOG_DIR}" ]]; then
    (
        cd "${ACCESS_LOG_DIR}" || exit 0
        for f in *; do
            [[ -f "$f" ]] || continue
            printf '%s\t%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')"
        done
    ) > "${ACCESS_SNAPSHOT}" 2>/dev/null || true
fi

set -- -Dstyle.color=always "$@"
set +e
mvn "$@" 2>&1 | tee "${CONSOLE_LOG}"
mvn_status=${PIPESTATUS[0]}
set -e

if [[ "${mvn_status}" -eq 0 ]]; then
    exit 0
fi

# From here everything is best-effort and must never replace mvn_status.
set +e +u +o pipefail
RUN_END_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DURATION_SEC=$(( $(date +%s) - RUN_START_EPOCH ))

BUNDLE_DIR="${REPO_ROOT}/target/failure-diagnostics/${TS_DIR}"
COLLECTOR_ERRORS="${BUNDLE_DIR}/collector-errors.log"

record_coll() {
    [[ -n "${COLLECTOR_ERRORS:-}" ]] && printf '[collection] %s\n' "$*" >> "${COLLECTOR_ERRORS}"
    printf '%s\n' "$*" >> "${COLLECTOR_WARNINGS}"
}
record_integ() {
    [[ -n "${COLLECTOR_ERRORS:-}" ]] && printf '[integrity] %s\n' "$*" >> "${COLLECTOR_ERRORS}"
    printf '%s\n' "$*" >> "${INTEGRITY_WARNINGS}"
}

build_bundle() {
    mkdir -p "${BUNDLE_DIR}" || { printf 'failed to create bundle dir\n' >&2; return 1; }
    : > "${COLLECTOR_ERRORS}"

    LC_ALL=C sed $'s/\033\\[[0-9;]*m//g' "${CONSOLE_LOG}" \
        > "${BUNDLE_DIR}/maven-console.log" 2>>"${COLLECTOR_ERRORS}" || record_coll "maven-console.log sed/copy failed"

    copy_current_files() {
        local src_root="$1" dest_root="$2" label="$3"
        [[ -d "$src_root" ]] || { record_coll "no $label directory: $src_root"; return 0; }
        local f rel d
        while IFS= read -r f; do
            [[ -n "$f" ]] || continue
            rel="${f#${src_root}/}"
            d="${dest_root}/$(dirname "$rel")"
            mkdir -p "$d" 2>>"${COLLECTOR_ERRORS}" || { record_coll "mkdir failed: $d"; continue; }
            cp -p "$f" "${dest_root}/${rel}" 2>>"${COLLECTOR_ERRORS}" || record_coll "copy failed: $f"
        done < <(find "$src_root" -type f -newer "${MARKER}" 2>>"${COLLECTOR_ERRORS}")
    }

    copy_current_files "${REPO_ROOT}/target/surefire-reports" "${BUNDLE_DIR}/surefire-reports" "surefire-reports"
    copy_current_files "${REPO_ROOT}/target/allure-results" "${BUNDLE_DIR}/allure-results" "allure-results"

    collect_access_logs() {
        [[ "${PROVIDER}" == "compose" && -n "${ACCESS_LOG_DIR}" ]] || return 0
        [[ -d "${ACCESS_LOG_DIR}" ]] || { record_coll "access-log dir missing: ${ACCESS_LOG_DIR}"; return 0; }
        mkdir -p "${BUNDLE_DIR}/access-logs" 2>>"${COLLECTOR_ERRORS}" || { record_coll "mkdir access-logs failed"; return 0; }
        local f base prev cur
        for f in "${ACCESS_LOG_DIR}"/*; do
            [[ -f "$f" ]] || continue
            base="${f##*/}"
            prev="$(awk -F'\t' -v n="${base}" '$1==n{print $2; exit}' "${ACCESS_SNAPSHOT}" 2>/dev/null || true)"
            if [[ -z "${prev}" ]]; then
                cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>>"${COLLECTOR_ERRORS}" || record_coll "access-log copy failed: ${base}"
                continue
            fi
            cur="$(wc -c < "$f" | tr -d ' ')" || { cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>>"${COLLECTOR_ERRORS}" || true; continue; }
            if [[ "${cur}" -gt "${prev}" ]]; then
                tail -c "+$((prev + 1))" "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>>"${COLLECTOR_ERRORS}" || record_coll "access-log tail failed: ${base}"
            elif [[ "${cur}" -lt "${prev}" ]]; then
                cat "$f" > "${BUNDLE_DIR}/access-logs/${base}" 2>>"${COLLECTOR_ERRORS}" || record_coll "access-log copy failed: ${base}"
            fi
        done
    }

    collect_compose_state() {
        [[ "${PROVIDER}" == "compose" ]] || return 0
        local cid image
        cid="$(docker compose ps --all -q "${COMPOSE_SERVICE}" 2>/dev/null | head -c12 || true)"
        {
            echo "=== docker compose ps --all ==="
            docker compose ps --all 2>&1 || true
            echo
            echo "=== docker inspect (selected fields) ==="
            if [[ -n "${cid}" ]]; then
                docker inspect --format \
                    'Image: {{.Config.Image}}
ImageId: {{.Image}}
StartedAt: {{.State.StartedAt}}
ExitCode: {{.State.ExitCode}}
OOMKilled: {{.State.OOMKilled}}
RestartCount: {{.RestartCount}}
Status: {{.State.Status}}' "${cid}" 2>&1 || true
            else
                echo "No ${COMPOSE_SERVICE} container found (running or exited)."
            fi
        } > "${BUNDLE_DIR}/container-state.txt" 2>>"${COLLECTOR_ERRORS}" || record_coll "container-state.txt failed"

        docker compose logs --since "${RUN_START_ISO}" --timestamps --no-color "${COMPOSE_SERVICE}" \
            > "${BUNDLE_DIR}/docker-compose.log" 2>&1 || record_coll "docker compose logs failed"

        if [[ -n "${cid}" ]]; then
            image="$(docker inspect --format '{{.Config.Image}}' "${cid}" 2>/dev/null || true)"
            COMPOSE_IMAGE="${image}"
            COMPOSE_CONTAINER_ID="${cid}"
        fi
    }

    COMPOSE_IMAGE=""; COMPOSE_CONTAINER_ID=""
    collect_compose_state
    collect_access_logs

    if [[ "${PROVIDER}" != "compose" ]]; then
        printf 'Diagnostics provider: none. Compose/container/access-log collection skipped.\n' \
            > "${BUNDLE_DIR}/diagnostics-skipped.txt" 2>>"${COLLECTOR_ERRORS}" || record_coll "diagnostics-skipped.txt failed"
    fi

    write_manifest
    write_readme
}

write_manifest() {
    local coll_json integ_json failed_json failed_count
    coll_json="$(jq -R -s 'split("\n")|map(select(length>0))' "${COLLECTOR_WARNINGS}" 2>/dev/null || printf '[]')"
    integ_json="$(jq -R -s 'split("\n")|map(select(length>0))' "${INTEGRITY_WARNINGS}" 2>/dev/null || printf '[]')"

    # Failed-test names from current-run Allure results.
    local cur_result_files=() rf
    while IFS= read -r rf; do [[ -n "$rf" ]] && cur_result_files+=("$rf"); done \
        < <(find "${REPO_ROOT}/target/allure-results" -type f -name '*-result.json' -newer "${MARKER}" 2>/dev/null)
    if [[ ${#cur_result_files[@]} -gt 0 ]]; then
        failed_json="$(jq -s '[.[] | select(.status=="failed") | .name] | unique' "${cur_result_files[@]}" 2>/dev/null || printf '[]')"
    else
        failed_json='[]'
    fi
    failed_count="$(printf '%s' "${failed_json}" | jq 'length' 2>/dev/null || printf '0')"

    # Allure attachment-integrity check against the source results directory.
    for rf in "${cur_result_files[@]}"; do
        local suite_dir src
        suite_dir="$(dirname "$rf")"
        while IFS= read -r src; do
            [[ -n "$src" ]] || continue
            if [[ ! -f "${suite_dir}/${src}" ]]; then
                record_integ "missing attachment ${src} referenced by $(basename "$rf")"
            fi
        done < <(jq -r '.attachments[].source // empty' "$rf" 2>/dev/null)
    done
    integ_json="$(jq -R -s 'split("\n")|map(select(length>0))' "${INTEGRITY_WARNINGS}" 2>/dev/null || printf '[]')"

    local git_commit git_dirty git_staged
    git_commit="$(git rev-parse --short HEAD 2>/dev/null || printf '')"
    if git status --porcelain 2>/dev/null | grep -q .; then git_dirty=true; else git_dirty=false; fi
    if git diff --cached --quiet 2>/dev/null; then git_staged=false; else git_staged=true; fi

    local java_ver maven_ver
    java_ver="$(java -version 2>&1 | head -1 || printf '')"
    maven_ver="$(mvn --version 2>&1 | head -1 || printf '')"

    jq -n \
        --arg schema "pettstore-api/failure-diagnostics/v1" \
        --arg runId "${TS_DIR}" \
        --arg startedAt "${RUN_START_ISO}" \
        --arg endedAt "${RUN_END_ISO}" \
        --argjson durationSeconds "${DURATION_SEC}" \
        --argjson mavenExitCode "${mvn_status}" \
        --arg mavenGoal "${MAVEN_GOAL}" \
        --argjson skipLocal "${SKIP_LOCAL}" \
        --argjson skipRegular "${SKIP_REGULAR}" \
        --argjson skipQuarantine "${SKIP_QUARANTINE}" \
        --arg targetType "${TARGET}" \
        --arg diagnosticsProvider "${PROVIDER}" \
        --arg baseUri "${BASE_URI}" \
        --arg gitCommit "${git_commit}" \
        --argjson gitDirty "${git_dirty}" \
        --argjson gitStaged "${git_staged}" \
        --arg javaVersion "${java_ver}" \
        --arg mavenVersion "${maven_ver}" \
        --arg composeService "${COMPOSE_SERVICE}" \
        --arg composeContainerId "${COMPOSE_CONTAINER_ID}" \
        --arg composeImage "${COMPOSE_IMAGE}" \
        --argjson failedTests "${failed_json}" \
        --argjson failedTestCount "${failed_count}" \
        --argjson collectionWarnings "${coll_json}" \
        --argjson integrityWarnings "${integ_json}" \
        '{schema:$schema,runId:$runId,startedAt:$startedAt,endedAt:$endedAt,durationSeconds:$durationSeconds,mavenExitCode:$mavenExitCode,maven:{goal:$mavenGoal,suiteSelection:{skipLocal:$skipLocal,skipRegular:$skipRegular,skipQuarantine:$skipQuarantine}},target:{type:$targetType,diagnosticsProvider:$diagnosticsProvider,baseUri:$baseUri},source:{gitCommit:$gitCommit,gitDirty:$gitDirty,gitStaged:$gitStaged},runtime:{java:$javaVersion,maven:$mavenVersion},sut:{composeService:$composeService,composeContainerId:$composeContainerId,composeImage:$composeImage},results:{failedTestCount:$failedTestCount,failedTests:$failedTests},warnings:{collection:$collectionWarnings,integrity:$integrityWarnings}}' \
        > "${BUNDLE_DIR}/manifest.json" 2>>"${COLLECTOR_ERRORS}" || record_coll "manifest.json write failed"
}

write_readme() {
    {
        echo "Failure diagnostics bundle"
        echo "Run start: ${RUN_START_ISO}"
        echo "Run end:   ${RUN_END_ISO}"
        echo "Maven exit code: ${mvn_status}"
        echo "Target: ${TARGET}  Provider: ${PROVIDER}  Base URI: ${BASE_URI:-<unset>}"
        echo
        echo "Contents:"
        (cd "${BUNDLE_DIR}" && find . -type f | sort)
        echo
        echo "See manifest.json for the machine-readable manifest and collector-errors.log"
        echo "for best-effort collection/integrity warnings."
    } > "${BUNDLE_DIR}/README.txt" 2>>"${COLLECTOR_ERRORS}" || record_coll "README.txt write failed"
}

build_bundle || printf 'build_bundle reported an error; partial bundle may exist\n' >&2

printf '\nMaven failed (exit %s). Diagnostics bundle written to %s\n' \
    "${mvn_status}" "${BUNDLE_DIR}" >&2

exit "${mvn_status}"
