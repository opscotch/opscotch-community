#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
DEPLOYMENT_COUNT=20
ONLINE_ITEMS=25
BUFFERED_ITEMS=100

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-buffer-recovery.XXXXXX")"
agent_container="opscotch-buffer-recovery-$$"
receiver_pid=""
receiver_phase=""

cleanup() {
    status=$?

    if (( status != 0 )); then
        printf '\n--- receiver log ---\n' >&2
        tail -100 "$temp_dir/receiver-$receiver_phase.log" >&2 2>/dev/null || true
        printf '\n--- received output counts ---\n' >&2
        python3 - "$temp_dir/state-$receiver_phase" >&2 2>/dev/null <<'PY' || true
import json
import pathlib
import sys

state = pathlib.Path(sys.argv[1])
for output_type in ("metrics", "logs"):
    path = state / f"received-{output_type}.json"
    count = len(json.loads(path.read_text())) if path.exists() else 0
    print(f"{output_type}: {count}")
PY
        printf '\n--- agent log ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -300 >&2 || true
    fi

    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" 2>/dev/null || true
        wait "$receiver_pid" 2>/dev/null || true
    fi
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

read -ra reserved_ports <<<"$(
    python3 "$SCENARIO_DIR/reserve_ports.py" "$((DEPLOYMENT_COUNT + 1))"
)"
receiver_port="${reserved_ports[0]}"
agent_ports=("${reserved_ports[@]:1}")
agent_ports_csv="$(IFS=,; printf '%s' "${agent_ports[*]}")"

mkdir -p "$temp_dir/fixtures" "$temp_dir/persistence"
for deployment_number in $(seq 1 "$DEPLOYMENT_COUNT"); do
    mkdir -p \
        "$temp_dir/persistence/buffer-recovery-$deployment_number/metrics" \
        "$temp_dir/persistence/buffer-recovery-$deployment_number/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$receiver_port" \
    --agent-ports "$agent_ports_csv" \
    --output-directory "$temp_dir/fixtures"

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
    local state_directory="$1"
    local expected_items="$2"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_directory/all-outputs.received" ]]; then
            return 0
        fi
        if [[ -s "$state_directory/failure.txt" ]]; then
            cat "$state_directory/failure.txt" >&2
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s metrics and %s logs\n' \
        "$expected_items" "$expected_items" >&2
    return 1
}

start_receiver() {
    local phase="$1"
    receiver_phase="$phase"
    local state_directory="$temp_dir/state-$phase"
    mkdir -p "$state_directory"

    python3 "$SCENARIO_DIR/receiver.py" \
        --port "$receiver_port" \
        --expected-metrics "$temp_dir/fixtures/expected-$phase-metrics.json" \
        --expected-logs "$temp_dir/fixtures/expected-$phase-logs.json" \
        --state-directory "$state_directory" \
        >"$temp_dir/receiver-$phase.log" 2>&1 &
    receiver_pid=$!
    wait_for_url "http://127.0.0.1:$receiver_port/health"
}

stop_receiver() {
    kill "$receiver_pid"
    wait "$receiver_pid" 2>/dev/null || true
    receiver_pid=""
}

start_agent() {
    docker run --detach \
        --name "$agent_container" \
        --network host \
        --volume "$temp_dir/fixtures:/fixtures:ro" \
        --volume "$temp_dir/persistence:/persistence" \
        --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
        --env OPSCOTCH_LEGAL_ACCEPTED \
        "$AGENT_IMAGE" >/dev/null
}

wait_for_deployments() {
    local port
    for port in "${agent_ports[@]}"; do
        wait_for_url "http://127.0.0.1:$port/health"
    done
}

trigger_phase() {
    local phase="$1"
    local port
    for port in "${agent_ports[@]}"; do
        curl --silent --show-error --fail \
            --request POST \
            "http://127.0.0.1:$port/emit-$phase" >/dev/null
    done
}

online_expected="$((DEPLOYMENT_COUNT * ONLINE_ITEMS))"
buffered_expected="$((DEPLOYMENT_COUNT * BUFFERED_ITEMS))"

start_receiver online
start_agent
wait_for_deployments

trigger_phase online
wait_for_outputs "$temp_dir/state-online" "$online_expected"

stop_receiver
trigger_phase buffered

sleep 4
docker logs "$agent_container" >"$temp_dir/agent-outage.log" 2>&1
if ! grep -q 'Connection Failure while trying to send data' \
    "$temp_dir/agent-outage.log"; then
    printf 'Agent did not log an output connection failure during outage\n' >&2
    exit 1
fi

recovery_started_at=$SECONDS
start_receiver buffered
wait_for_outputs "$temp_dir/state-buffered" "$buffered_expected"
recovery_elapsed=$((SECONDS - recovery_started_at))

read -r metric_bytes log_bytes total_bytes < <(
    python3 - "$temp_dir/state-buffered/received-bytes.json" <<'PY'
import json
import pathlib
import sys

counts = json.loads(pathlib.Path(sys.argv[1]).read_text())
metric_bytes = counts["metrics"]
log_bytes = counts["logs"]
print(metric_bytes, log_bytes, metric_bytes + log_bytes)
PY
)

printf 'Recovered %s buffered metrics and %s buffered logs from %s deployments in %ss (%s bytes: metrics=%s logs=%s)\n' \
    "$buffered_expected" "$buffered_expected" "$DEPLOYMENT_COUNT" \
    "$recovery_elapsed" "$total_bytes" "$metric_bytes" "$log_bytes"
