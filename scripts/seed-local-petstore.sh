#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
. "${SCRIPT_DIR}/petstore-context.sh"

if [[ "${PETSTORE_TARGET}" != "local-compose" ]]; then
    printf 'seed requires PETSTORE_TARGET=local-compose (current: %s).\n' "${PETSTORE_TARGET}" >&2
    exit 2
fi

BASE_URI="${PETSTORE_BASE_URI}"

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

order_ids=()
for fixture in "${REPO_ROOT}"/test-data/orders/*.json; do
    order_ids+=("$(jq --raw-output --exit-status '.id' "${fixture}")")
    post_fixture "/store/order" "${fixture}"
done

for order_id in "${order_ids[@]}"; do
    curl \
        --fail-with-body \
        --silent \
        --show-error \
        --output /dev/null \
        --header "Accept: application/json" \
        "${BASE_URI}/store/order/${order_id}"
done

printf 'Verified fixture orders %s\n' "${order_ids[*]}"
