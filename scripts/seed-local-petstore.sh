#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BASE_URI="${PETSTORE_BASE_URI:-http://localhost:${PETSTORE_PORT:-8080}/v2}"

post_fixture() {
    local endpoint="$1"
    local fixture="$2"

    curl \
        --fail-with-body \
        --silent \
        --show-error \
        --output /dev/null \
        --header "Accept: application/json" \
        --header "Content-Type: application/json" \
        --data-binary "@${fixture}" \
        "${BASE_URI}${endpoint}"
    printf 'Seeded %s\n' "${fixture#${REPO_ROOT}/}"
}

for fixture in "${REPO_ROOT}"/test-data/pets/*.json; do
    post_fixture "/pet" "${fixture}"
done

for fixture in "${REPO_ROOT}"/test-data/orders/*.json; do
    post_fixture "/store/order" "${fixture}"
done

for order_id in 1001 1002; do
    curl \
        --fail-with-body \
        --silent \
        --show-error \
        --output /dev/null \
        --header "Accept: application/json" \
        "${BASE_URI}/store/order/${order_id}"
done

printf 'Verified fixture orders 1001 and 1002\n'
