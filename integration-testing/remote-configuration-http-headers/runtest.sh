#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-18}"
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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-remote-configuration-http-headers.XXXXXX")"
project_name="opscotch-remote-configuration-http-headers-$$"
compose_file="$SCENARIO_DIR/compose.yaml"

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- compose ps ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" ps >&2 || true
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$temp_dir/state/failure.txt" \
            "$temp_dir/state/complete.txt" \
            "$temp_dir/state/config-requests.ndjson" \
            "$temp_dir/state/received-metrics.json" \
            "$temp_dir/state/received-logs.json"
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
        return 0
    fi

    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$temp_dir/state" "$temp_dir/fixtures" "$temp_dir/persistence"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --agent-port 8081 \
    --output-directory "$temp_dir/fixtures"

mkdir -p \
    "$temp_dir/persistence/remote-configuration-http-headers/metrics" \
    "$temp_dir/persistence/remote-configuration-http-headers/logs"

export SCENARIO_DIR TEMP_DIR="$temp_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_file() {
    local path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
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

assert_exact_outputs() {
    python3 - "$temp_dir/state/received-metrics.json" "$temp_dir/state/received-logs.json" <<'PY'
import json
import pathlib
import sys

metrics_path = pathlib.Path(sys.argv[1])
logs_path = pathlib.Path(sys.argv[2])

metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else []
logs = json.loads(logs_path.read_text()) if logs_path.exists() else []

if [record.get("name") for record in metrics] != ["remote-configuration-http-headers-metric"]:
    raise SystemExit(f"unexpected metrics: {metrics}")
if [record.get("token") for record in logs] != ["remote-configuration-http-headers-log"]:
    raise SystemExit(f"unexpected logs: {logs}")
PY
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans >/dev/null

wait_for_file "$temp_dir/state/config-requests.ndjson"

docker compose -p "$project_name" -f "$compose_file" exec -T agent \
    /bin/busybox wget -qO- http://127.0.0.1:8081/emit \
    >/dev/null

wait_for_file "$temp_dir/state/complete.txt"
assert_exact_outputs

printf 'Remote configuration fetches carried the expected headers and loaded workflow outputs with docker compose\n'
