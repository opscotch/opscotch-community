#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
EXPECTED_DEPLOYMENTS=20
EXPECTED_METRICS=2000
EXPECTED_LOGS=2000

for command in curl docker python3; do
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
agent_container="opscotch-twenty-bootstrap-$$"
receiver_pid=""

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
        printf '\n--- current agent log ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -200 >&2 || true
        printf '\n--- first-run agent log ---\n' >&2
        tail -200 "$temp_dir/agent-first.log" >&2 2>/dev/null || true
    fi

    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" 2>/dev/null || true
        wait "$receiver_pid" 2>/dev/null || true
    fi
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

receiver_port="$(python3 "$SCENARIO_DIR/reserve_ports.py" 1)"
mkdir -p "$temp_dir/fixtures" "$temp_dir/persistence" "$temp_dir/state"
for deployment_number in $(seq 1 "$EXPECTED_DEPLOYMENTS"); do
    mkdir -p \
        "$temp_dir/persistence/twenty-bootstrap-$deployment_number/metrics" \
        "$temp_dir/persistence/twenty-bootstrap-$deployment_number/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$receiver_port" \
    --output-directory "$temp_dir/fixtures"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$receiver_port" \
    --expected-metrics "$temp_dir/fixtures/expected-metrics.json" \
    --expected-logs "$temp_dir/fixtures/expected-logs.json" \
    --state-directory "$temp_dir/state" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_url() {
    local url="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$url" >&2
    return 1
}

wait_for_outputs() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/all-outputs.received" ]]; then
            return 0
        fi
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
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
    docker run --detach \
        --name "$agent_container" \
        --network host \
        --volume "$temp_dir/fixtures:/fixtures:ro" \
        --volume "$temp_dir/persistence:/persistence" \
        --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
        --env OPSCOTCH_LEGAL_ACCEPTED \
        "$AGENT_IMAGE" >/dev/null
}

assert_ready_logs() {
    local log_file="$1"
    local ready_count
    ready_count="$(
        grep -c \
            'Startup activation complete for deploymentId: twenty-bootstrap-.*activated=true' \
            "$log_file" || true
    )"
    if (( ready_count < EXPECTED_DEPLOYMENTS )); then
        printf 'Expected at least %s successful activation logs, found %s\n' \
            "$EXPECTED_DEPLOYMENTS" "$ready_count" >&2
        return 1
    fi
}

reset_receiver_state() {
    curl --silent --show-error --fail \
        --request POST \
        "http://127.0.0.1:$receiver_port/reset" >/dev/null
}

wait_for_url "http://127.0.0.1:$receiver_port/health"

first_started_at=$SECONDS
start_agent
wait_for_outputs
docker logs "$agent_container" >"$temp_dir/agent-first.log" 2>&1
assert_ready_logs "$temp_dir/agent-first.log"
first_elapsed=$((SECONDS - first_started_at))

docker stop --time 10 "$agent_container" >/dev/null
docker rm "$agent_container" >/dev/null
reset_receiver_state

restart_started_at=$SECONDS
start_agent
wait_for_outputs
docker logs "$agent_container" >"$temp_dir/agent-restart.log" 2>&1
assert_ready_logs "$temp_dir/agent-restart.log"
restart_elapsed=$((SECONDS - restart_started_at))

printf '%s metrics and %s logs received from %s deployments; startup=%ss restart=%ss\n' \
    "$EXPECTED_METRICS" "$EXPECTED_LOGS" "$EXPECTED_DEPLOYMENTS" \
    "$first_elapsed" "$restart_elapsed"
