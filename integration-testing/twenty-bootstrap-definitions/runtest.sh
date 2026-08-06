#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
EXPECTED_DEPLOYMENTS=20
EXPECTED_METRICS=2000
EXPECTED_LOGS=2000

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-twenty-bootstrap.XXXXXX")"
project_name="opscotch-twenty-bootstrap-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    status=$?

    if (( status != 0 )); then
        printf '\n--- receiver log ---\n' >&2
        tail -80 "$temp_dir/receiver.log" >&2 2>/dev/null || true
        printf '\n--- received output counts ---\n' >&2
        python3 - "$temp_dir/state" >&2 2>/dev/null <<'PY' || true
import json
import pathlib
import sys

state = pathlib.Path(sys.argv[1])
for output_type in ("metrics", "logs"):
    path = state / f"received-{output_type}.json"
    count = len(json.loads(path.read_text())) if path.exists() else 0
    print(f"{output_type}: {count}")
PY
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
    fi

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

receiver_port=8080
mkdir -p "$fixture_dir" "$persistence_dir" "$state_dir"
for deployment_number in $(seq 1 "$EXPECTED_DEPLOYMENTS"); do
    mkdir -p \
        "$persistence_dir/twenty-bootstrap-$deployment_number/metrics" \
        "$persistence_dir/twenty-bootstrap-$deployment_number/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port "$receiver_port" \
    --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_outputs() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/all-outputs.received" ]]; then
            return 0
        fi
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s metrics and %s logs\n' \
        "$EXPECTED_METRICS" "$EXPECTED_LOGS" >&2
    return 1
}

start_agent() {
    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --force-recreate agent >/dev/null
}

assert_ready_logs() {
    local ready_count
    ready_count="$(
        docker compose -p "$project_name" -f "$compose_file" logs --no-color agent 2>/dev/null \
            | grep -c 'Startup activation complete for deploymentId: twenty-bootstrap-.*activated=true' \
            || true
    )"
    if (( ready_count < EXPECTED_DEPLOYMENTS )); then
        printf 'Expected at least %s successful activation logs, found %s\n' \
            "$EXPECTED_DEPLOYMENTS" "$ready_count" >&2
        return 1
    fi
}

reset_receiver_state() {
    docker compose -p "$project_name" -f "$compose_file" exec -T receiver python3 - <<'PY'
import urllib.request
urllib.request.urlopen(
    urllib.request.Request("http://127.0.0.1:8080/reset", method="POST"),
    timeout=5,
).read()
PY
}

docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans receiver >/dev/null

first_started_at=$SECONDS
start_agent
wait_for_outputs
assert_ready_logs
first_elapsed=$((SECONDS - first_started_at))

docker compose -p "$project_name" -f "$compose_file" stop agent >/dev/null
docker compose -p "$project_name" -f "$compose_file" rm -f agent >/dev/null
reset_receiver_state

restart_started_at=$SECONDS
start_agent
wait_for_outputs
assert_ready_logs
restart_elapsed=$((SECONDS - restart_started_at))

printf '%s metrics and %s logs received from %s deployments; startup=%ss restart=%ss\n' \
    "$EXPECTED_METRICS" "$EXPECTED_LOGS" "$EXPECTED_DEPLOYMENTS" \
    "$first_elapsed" "$restart_elapsed"
