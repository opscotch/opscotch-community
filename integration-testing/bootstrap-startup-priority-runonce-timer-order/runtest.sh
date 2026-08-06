#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-45}"

for command in docker python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    fi
done

if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-startup-priority.XXXXXX")"
project_name="opscotch-startup-priority-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/complete.txt" \
            "$state_dir/received-metrics.json" \
            "$state_dir/received-logs.json" \
            "$state_dir/received-events.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
for deployment_id in bootstrap-priority-01 bootstrap-priority-05 bootstrap-priority-10; do
    mkdir -p \
        "$persistence_dir/$deployment_id/metrics" \
        "$persistence_dir/$deployment_id/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_completion() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        if [[ -s "$state_dir/complete.txt" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for the target bootstrap to emit its metric\n' >&2
    return 1
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans >/dev/null
wait_for_completion

python3 - \
    "$state_dir/received-metrics.json" \
    "$state_dir/received-logs.json" \
    "$fixture_dir/expected-metrics.json" \
    "$fixture_dir/expected-logs.json" <<'PY'
import json
import pathlib
import sys

received_metrics = json.loads(pathlib.Path(sys.argv[1]).read_text())
received_logs = json.loads(pathlib.Path(sys.argv[2]).read_text())
expected_metrics = json.loads(pathlib.Path(sys.argv[3]).read_text())
expected_logs = json.loads(pathlib.Path(sys.argv[4]).read_text())
if sorted(received_metrics) != sorted(expected_metrics):
    raise SystemExit(
        f"unexpected received metrics: {received_metrics} != {expected_metrics}"
    )
if sorted(received_logs) != sorted(expected_logs):
    raise SystemExit(
        f"unexpected received logs: {received_logs} != {expected_logs}"
    )
PY

docker compose -p "$project_name" -f "$compose_file" logs --no-color agent >/dev/null

printf 'Multi-member deployment access routed to the first matching target deployment\n'
