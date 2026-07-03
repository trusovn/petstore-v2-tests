#!/usr/bin/env bash
# Resolve the Petstore runtime context once and export it to consumers.
# Source this script; do not execute it directly.
#
# Target modes (PETSTORE_TARGET):
#   local-compose (default) - managed local Compose service. The base URI is
#       derived from PETSTORE_PORT (default 8080) and the fixed base path /v2
#       (the Petstore v2 image serves /v2).
#   external - a user-supplied endpoint. PETSTORE_BASE_URI is required.
#
# Conflicting configuration is rejected rather than guessed: setting
# PETSTORE_BASE_URI under local-compose is an error (use PETSTORE_PORT, or
# select PETSTORE_TARGET=external). This script is idempotent: it is a no-op
# when PETSTORE_CONTEXT_RESOLVED is already 1.
#
# Exports: PETSTORE_TARGET, PETSTORE_PORT, PETSTORE_BASE_URI,
# PETSTORE_ACCESS_LOG_DIR, PETSTORE_CONTEXT_RESOLVED.

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
    printf 'This script must be sourced, not executed: . %s\n' "$0" >&2
    exit 2
fi

if [[ "${PETSTORE_CONTEXT_RESOLVED:-}" == "1" ]]; then
    return 0
fi

PETSTORE_TARGET="${PETSTORE_TARGET:-local-compose}"

case "${PETSTORE_TARGET}" in
    local-compose)
        if [[ "${PETSTORE_BASE_URI:-}" =~ [^[:space:]] ]]; then
            printf 'PETSTORE_BASE_URI must not be set for local-compose; use PETSTORE_PORT or select PETSTORE_TARGET=external.\n' >&2
            return 1
        fi
        PETSTORE_PORT="${PETSTORE_PORT:-8080}"
        PETSTORE_BASE_URI="http://localhost:${PETSTORE_PORT}/v2"
        PETSTORE_ACCESS_LOG_DIR="${PETSTORE_ACCESS_LOG_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/.runtime/petstore-logs/access}"
        ;;
    external)
        if [[ ! "${PETSTORE_BASE_URI:-}" =~ [^[:space:]] ]]; then
            printf 'PETSTORE_TARGET=external requires PETSTORE_BASE_URI to be set.\n' >&2
            return 1
        fi
        PETSTORE_ACCESS_LOG_DIR=""
        ;;
    *)
        printf 'Unknown PETSTORE_TARGET=%q (expected local-compose|external).\n' "${PETSTORE_TARGET}" >&2
        return 1
        ;;
esac

export PETSTORE_TARGET PETSTORE_PORT PETSTORE_BASE_URI \
       PETSTORE_ACCESS_LOG_DIR \
       PETSTORE_CONTEXT_RESOLVED=1
