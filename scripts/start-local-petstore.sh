#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BASE_URI="${PETSTORE_BASE_URI:-http://localhost:${PETSTORE_PORT:-8080}/v2}"
ACCESS_LOG_DIR="${PETSTORE_ACCESS_LOG_DIR:-${REPO_ROOT}/.runtime/petstore-logs/access}"
reset=false

if [[ "${1:-}" == "--reset" ]]; then
    reset=true
    shift
fi

if [[ $# -ne 0 ]]; then
    printf 'Usage: %s [--reset]\n' "${0}" >&2
    exit 2
fi

mkdir -p "${ACCESS_LOG_DIR}"
export PETSTORE_ACCESS_LOG_DIR="${ACCESS_LOG_DIR}"

cd "${REPO_ROOT}"
if [[ "${reset}" == "true" ]]; then
    docker compose up -d --force-recreate petstore
else
    docker compose up -d petstore
fi

ready=false
for _ in $(seq 1 60); do
    if curl --fail --silent --output /dev/null "${BASE_URI}/swagger.json"; then
        ready=true
        break
    fi
    sleep 1
done

if [[ "${ready}" != "true" ]]; then
    printf 'Petstore did not become ready at %s within 60 seconds.\n' "${BASE_URI}" >&2
    docker compose ps >&2 || true
    docker compose logs --no-color --tail 100 petstore >&2 || true
    exit 1
fi

"${SCRIPT_DIR}/seed-local-petstore.sh"
printf 'Petstore is ready and seeded at %s\n' "${BASE_URI}"
