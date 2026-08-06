#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$SCENARIO_DIR/../multi-bootstrap-buffer-recovery"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
DEPLOYMENT_COUNT=20

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-restart-durability.XXXXXX")"
project_name="opscotch-restart-durability-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 250 >&2 || true
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/all-outputs.received" \
            "$state_dir/received-metrics.json" \
            "$state_dir/received-logs.json"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf 'Preserved failed test artifacts in %s\n' "$temp_dir" >&2
        return
    fi
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

receiver_port=8080
agent_ports=()
for ((deployment_number = 1; deployment_number <= DEPLOYMENT_COUNT; deployment_number++)); do
    agent_ports+=("$((18080 + deployment_number))")
done
agent_ports_csv="$(IFS=,; printf '%s' "${agent_ports[*]}")"

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
for deployment_number in $(seq 1 "$DEPLOYMENT_COUNT"); do
    mkdir -p \
        "$persistence_dir/restart-durability-$deployment_number/metrics"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port "$receiver_port" \
    --agent-ports "$agent_ports_csv" \
    --output-directory "$fixture_dir"

export SCENARIO_DIR HELPER_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" \
    PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_url() {
    local url="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker compose -p "$project_name" -f "$compose_file" exec -T client \
            python3 - "$url" <<'PY' >/dev/null 2>&1
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=1) as response:
    response.read()
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$url" >&2
    return 1
}

start_agent() {
    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    docker compose -p "$project_name" -f "$compose_file" up -d \
        --remove-orphans --force-recreate agent >/dev/null
}

wait_for_deployments() {
    local port
    for port in "${agent_ports[@]}"; do
        wait_for_url "http://agent:$port/health"
    done
}

trigger_restart() {
    local port
    for port in "${agent_ports[@]}"; do
        docker compose -p "$project_name" -f "$compose_file" exec -T client \
            python3 - "$port" <<'PY'
import sys
import urllib.request

port = sys.argv[1]
with urllib.request.urlopen(
    urllib.request.Request(f"http://agent:{port}/emit-restart", method="POST"),
    timeout=1,
) as response:
    response.read()
PY
    done
}

wait_for_persisted_batches() {
    python3 - "$persistence_dir" "$TIMEOUT_SECONDS" <<'PY'
import json
import pathlib
import sys
import time

root = pathlib.Path(sys.argv[1])
deadline = time.monotonic() + int(sys.argv[2])
observed = set()

while time.monotonic() < deadline:
    files = list(root.glob("restart-durability-*/metrics/receiver.dat-properties-*"))
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
    python3 - "$persistence_dir" "$label" <<'PY'
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
    local agent_container
    agent_container="$(docker compose -p "$project_name" -f "$compose_file" ps -q agent)"
    docker compose -p "$project_name" -f "$compose_file" stop -t 120 agent >/dev/null
    local elapsed=$((SECONDS - started_at))
    docker compose -p "$project_name" -f "$compose_file" logs --no-color agent \
        >"$temp_dir/pre-restart-agent.log" 2>&1
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

    docker compose -p "$project_name" -f "$compose_file" rm -f agent >/dev/null
}

start_receiver() {
    export EXPECTED_METRICS_FILE=expected-restart-metrics.json \
        EXPECTED_LOGS_FILE=expected-restart-logs.json
    docker compose -p "$project_name" -f "$compose_file" up -d \
        --remove-orphans --force-recreate receiver client >/dev/null
    wait_for_url "http://receiver:$receiver_port/health"
}

wait_for_outputs() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        [[ ! -s "$state_dir/failure.txt" ]] || {
            cat "$state_dir/failure.txt" >&2
            return 1
        }
        [[ ! -s "$state_dir/all-outputs.received" ]] || return
        sleep 0.25
    done

    python3 - \
        "$fixture_dir/expected-restart-metrics.json" \
        "$state_dir/received-metrics.json" <<'PY'
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

docker compose -p "$project_name" -f "$compose_file" up -d \
    --remove-orphans client >/dev/null
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
