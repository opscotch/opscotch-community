#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$SCENARIO_DIR/../multi-bootstrap-buffer-recovery"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
DEPLOYMENT_COUNT=20

for command in curl docker python3; do
    command -v "$command" >/dev/null 2>&1 || {
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    }
done

if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-restart-durability.XXXXXX")"
agent_container="opscotch-restart-durability-$$"
receiver_pid=""

cleanup() {
    local status=$?
    [[ -z "$receiver_pid" ]] || kill "$receiver_pid" 2>/dev/null || true
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "${KEEP_FAILED_INTEGRATION_TEST:-0}" == "1" ]]; then
        printf 'Preserved failed test artifacts in %s\n' "$temp_dir" >&2
        return
    fi
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

read -ra reserved_ports <<<"$(
    python3 "$HELPER_DIR/reserve_ports.py" "$((DEPLOYMENT_COUNT + 1))"
)"
receiver_port="${reserved_ports[0]}"
agent_ports=("${reserved_ports[@]:1}")
agent_ports_csv="$(IFS=,; printf '%s' "${agent_ports[*]}")"

mkdir -p "$temp_dir/fixtures" "$temp_dir/persistence"
for deployment_number in $(seq 1 "$DEPLOYMENT_COUNT"); do
    mkdir -p \
        "$temp_dir/persistence/restart-durability-$deployment_number/metrics"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$receiver_port" \
    --agent-ports "$agent_ports_csv" \
    --output-directory "$temp_dir/fixtures"

wait_for_url() {
    local url="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        curl --silent --fail --max-time 1 "$url" >/dev/null 2>&1 && return
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$url" >&2
    return 1
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

trigger_restart() {
    local port
    for port in "${agent_ports[@]}"; do
        curl --silent --show-error --fail --request POST \
            "http://127.0.0.1:$port/emit-restart" >/dev/null
    done
}

wait_for_persisted_batches() {
    python3 - "$temp_dir/persistence" "$TIMEOUT_SECONDS" <<'PY'
import json
import pathlib
import sys
import time

root = pathlib.Path(sys.argv[1])
deadline = time.monotonic() + int(sys.argv[2])
files = list(root.glob("restart-durability-*/metrics/receiver.dat-properties-*"))
observed = set()

while time.monotonic() < deadline:
    for path in files:
        try:
            entries = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        properties = {entry["k"]: entry["v"] for entry in entries}
        if "-restart-" in str(properties.get("STEP_LAST")):
            observed.add(path)
    if len(observed) == len(files) == 20:
        raise SystemExit(0)
    time.sleep(0.1)

raise SystemExit(f"Observed persisted restart batches for {len(observed)}/20 senders")
PY
}

inspect_persistence() {
    local label="$1"
    python3 - "$temp_dir/persistence" "$label" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
label = sys.argv[2]
files = list(root.glob("restart-durability-*/metrics/receiver.dat-properties-*"))
valid = restart = 0
invalid = []
for path in files:
    try:
        entries = json.loads(path.read_text())
        valid += 1
    except (OSError, json.JSONDecodeError) as error:
        invalid.append(f"{path.parent.parent.name}: {error}")
        continue
    properties = {entry["k"]: entry["v"] for entry in entries}
    restart += "-restart-" in str(properties.get("STEP_LAST"))

print(
    f"{label}: files={len(files)}, valid_json={valid}, "
    f"restart_batches={restart}, invalid={invalid}"
)
PY
}

stop_agent() {
    local started_at="$SECONDS"
    docker stop --time 120 "$agent_container" >/dev/null
    local elapsed=$((SECONDS - started_at))
    docker logs "$agent_container" >"$temp_dir/pre-restart-agent.log" 2>&1
    docker inspect \
        --format 'exitCode={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} error={{json .State.Error}}' \
        "$agent_container" >"$temp_dir/pre-restart-container-state.txt"

    {
        printf 'shutdownSeconds=%s %s\n' \
            "$elapsed" "$(cat "$temp_dir/pre-restart-container-state.txt")"
        printf 'shutdownStarted=%s workflowShutdownComplete=%s\n' \
            "$(grep -c 'Shutting down agent - waiting for running tasks to complete' "$temp_dir/pre-restart-agent.log" || true)" \
            "$(grep -c 'Workflow shutdown complete:' "$temp_dir/pre-restart-agent.log" || true)"
        inspect_persistence after-shutdown
    } | tee "$temp_dir/shutdown-report.txt"

    docker rm "$agent_container" >/dev/null
}

start_receiver() {
    mkdir -p "$temp_dir/state"
    python3 "$HELPER_DIR/receiver.py" \
        --port "$receiver_port" \
        --expected-metrics "$temp_dir/fixtures/expected-restart-metrics.json" \
        --expected-logs "$temp_dir/fixtures/expected-restart-logs.json" \
        --state-directory "$temp_dir/state" \
        >"$temp_dir/receiver.log" 2>&1 &
    receiver_pid=$!
    wait_for_url "http://127.0.0.1:$receiver_port/health"
}

wait_for_outputs() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        [[ ! -s "$temp_dir/state/failure.txt" ]] || {
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        }
        [[ ! -s "$temp_dir/state/all-outputs.received" ]] || return
        sleep 0.25
    done

    python3 - \
        "$temp_dir/fixtures/expected-restart-metrics.json" \
        "$temp_dir/state/received-metrics.json" <<'PY'
import json
import pathlib
import sys

expected = set(json.loads(pathlib.Path(sys.argv[1]).read_text()))
received_path = pathlib.Path(sys.argv[2])
received = set(json.loads(received_path.read_text())) if received_path.exists() else set()
missing = sorted(expected - received)
raise SystemExit(
    f"Restart recovery incomplete: received={len(received)}/{len(expected)}, "
    f"missing sample={missing[:10]}"
)
PY
}

start_agent
wait_for_deployments
trigger_restart
wait_for_persisted_batches
inspect_persistence before-shutdown | tee "$temp_dir/before-shutdown.txt"
stop_agent

start_receiver
start_agent
wait_for_deployments
wait_for_outputs

printf 'Recovered all 400 persisted restart metrics across 20 deployments\n'
