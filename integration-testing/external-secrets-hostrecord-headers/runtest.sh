#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-30}"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

for command in docker python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    fi
done

if ! docker compose version >/dev/null 2>&1; then
    printf 'docker compose is required for this scenario\n' >&2
    exit 2
fi

# Use the user-provided OPSCOTCH_LEGAL_ACCEPTED from the shell environment; do not hardcode a value here.
if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-external-secrets-hostrecord-headers.XXXXXX")"
project_name="opscotch-external-secrets-hostrecord-headers-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- compose ps ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" ps >&2 || true
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/complete.txt" \
            "$state_dir/received-secret-requests.json" \
            "$state_dir/received-metric-requests.json"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
    fi

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true

    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir/external-secrets-hostrecord-headers/metrics"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --output-directory "$fixture_dir"

export OPSCOTCH_SECRETS_FROM="$(<"$fixture_dir/hostrecord-source.txt")"
export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_file() {
    local path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        if [[ -s "$path" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$path" >&2
    return 1
}

docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --wait receiver >/dev/null
printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --force-recreate agent >/dev/null

wait_for_file "$state_dir/complete.txt"

python3 - "$state_dir/received-secret-requests.json" "$state_dir/received-metric-requests.json" "$fixture_dir/expected-secret-headers.json" "$fixture_dir/expected-metric-name.txt" "$fixture_dir/expected-metric-path.txt" <<'PY'
import json
import pathlib
import sys

secret_requests_path = pathlib.Path(sys.argv[1])
metric_requests_path = pathlib.Path(sys.argv[2])
expected_secret_headers = json.loads(pathlib.Path(sys.argv[3]).read_text())
expected_metric_name = pathlib.Path(sys.argv[4]).read_text().strip()
expected_metric_path = pathlib.Path(sys.argv[5]).read_text().strip()

secret_requests = json.loads(secret_requests_path.read_text()) if secret_requests_path.exists() else []
metric_requests = json.loads(metric_requests_path.read_text()) if metric_requests_path.exists() else []

if not secret_requests:
    raise SystemExit("no secret requests were recorded")

for request in secret_requests:
    if request.get("path") != "/secret.properties":
        raise SystemExit(f"unexpected secret path: {request}")
    headers = request.get("headers") or {}
    for header_name, expected_value in expected_secret_headers.items():
        if headers.get(header_name) != expected_value:
            raise SystemExit(
                f"missing or mismatched secret header {header_name!r}: "
                f"expected {expected_value!r}, got {headers.get(header_name)!r}"
            )

if not metric_requests:
    raise SystemExit("no metric requests were recorded")

if metric_requests[0].get("path") != expected_metric_path:
    raise SystemExit(f"unexpected metric path: {metric_requests[0]}")

if metric_requests[0].get("names") != [expected_metric_name]:
    raise SystemExit(f"unexpected metric names: {metric_requests[0]}")
PY

printf 'Secret fetch headers were forwarded and the loaded workflow emitted its metric with docker compose\n'
