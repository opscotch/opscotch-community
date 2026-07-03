#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIME_SCALE="${SCENARIO_TIME_SCALE:-0.1}"
PHASE_SECONDS="${INTEGRATION_TEST_PHASE_SECONDS:-75}"
MINIMUM_OUTPUTS="${INTEGRATION_TEST_MINIMUM_OUTPUTS:-5}"
STOP_LIMIT_SECONDS="${INTEGRATION_TEST_STOP_LIMIT_SECONDS:-15}"
SLOW_COLLECTORS_PER_TIMEOUT="${SLOW_COLLECTORS_PER_TIMEOUT:-2}"
AGENT_CPUS="${OPSCOTCH_AGENT_CPUS:-1}"
AGENT_MEMORY="${OPSCOTCH_AGENT_MEMORY:-512m}"
AGENT_PIDS_LIMIT="${OPSCOTCH_AGENT_PIDS_LIMIT:-512}"
ARTIFACT_ROOT="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
ARTIFACT_DIR="$ARTIFACT_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$$"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-seven-overlap.XXXXXX")"
agent_container="opscotch-seven-overlap-$$"
server_pid=""

cleanup() {
    status=$?
    if (( status != 0 )); then
        printf '\n--- scenario state ---\n' >&2
        for file in "$temp_dir"/state/*.json "$temp_dir"/state/failure.txt; do
            [[ -f "$file" ]] && { printf '\n%s\n' "$file" >&2; cat "$file" >&2; }
        done
        printf '\n--- latest agent log ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -250 >&2 || true
    fi
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    if [[ -n "$server_pid" ]]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM
mkdir -p "$ARTIFACT_DIR"

port="$(python3 "$SCENARIO_DIR/reserve_port.py")"
mkdir -p "$temp_dir/state"
python3 "$SCENARIO_DIR/scenario_server.py" \
    --port "$port" \
    --state-directory "$temp_dir/state" \
    --time-scale "$TIME_SCALE" \
    >"$temp_dir/server.log" 2>&1 &
server_pid=$!

deadline=$((SECONDS + 10))
until curl --silent --fail --max-time 1 "http://127.0.0.1:$port/health" >/dev/null; do
    if (( SECONDS >= deadline )); then
        printf 'Scenario server did not become ready\n' >&2
        exit 1
    fi
    sleep 0.2
done

assert_outputs() {
    local count="$1"
    python3 - "$temp_dir/state/metrics.json" "$count" "$MINIMUM_OUTPUTS" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
deployments = int(sys.argv[2])
minimum = int(sys.argv[3])
metrics = json.loads(path.read_text()) if path.exists() else {}
failures = []
for number in range(1, deployments + 1):
    for suffix in ("heartbeat", "fast"):
        name = f"overlap-{number}-{suffix}"
        actual = metrics.get(name, 0)
        if actual < minimum:
            failures.append(f"{name}: expected >= {minimum}, received {actual}")
if failures:
    raise SystemExit("\n".join(failures))
PY
}

wait_for_slow_requests_to_drain() {
    local deadline=$((SECONDS + 20))
    while (( SECONDS < deadline )); do
        if python3 - "$temp_dir/state/concurrency.json" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
state = json.loads(path.read_text()) if path.exists() else {}
raise SystemExit(0 if state.get("activeSlowRequests", 0) == 0 else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for fixture-server slow requests to drain\n' >&2
    return 1
}

run_phase() {
    local count="$1"
    local fixtures="$temp_dir/fixtures-$count"
    local persistence="$temp_dir/persistence-$count"
    local agent_log="$temp_dir/agent-$count.log"

    mkdir -p "$fixtures" "$persistence"
    for number in $(seq 1 "$count"); do
        mkdir -p "$persistence/overlap-$number/metrics"
    done
    python3 "$SCENARIO_DIR/generate_fixtures.py" \
        --deployment-count "$count" \
        --receiver-port "$port" \
        --output-directory "$fixtures" \
        --time-scale "$TIME_SCALE" \
        --slow-collectors-per-timeout "$SLOW_COLLECTORS_PER_TIMEOUT"

    curl --silent --show-error --fail --request POST \
        "http://127.0.0.1:$port/reset" >/dev/null

    docker run --detach \
        --name "$agent_container" \
        --network host \
        --cpus "$AGENT_CPUS" \
        --memory "$AGENT_MEMORY" \
        --memory-swap "$AGENT_MEMORY" \
        --pids-limit "$AGENT_PIDS_LIMIT" \
        --volume "$fixtures:/fixtures:ro" \
        --volume "$persistence:/persistence" \
        --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
        --env OPSCOTCH_LEGAL_ACCEPTED \
        --env "OPSCOTCH_AGENT_METRIC_PROPERTIES=url=http://127.0.0.1:$port/agent-metrics;token=stress-diagnostics-$count" \
        "$AGENT_IMAGE" >/dev/null

    sleep "$PHASE_SECONDS"
    docker logs "$agent_container" >"$agent_log" 2>&1
    cp "$agent_log" "$ARTIFACT_DIR/agent-$count.log"
    cp "$temp_dir/state/metrics.json" "$ARTIFACT_DIR/workflow-metrics-$count.json"
    cp "$temp_dir/state/agent-metrics.json" "$ARTIFACT_DIR/agent-metrics-$count.json"
    cp "$temp_dir/state/concurrency.json" "$ARTIFACT_DIR/concurrency-$count.json"
    python3 - "$agent_log" "$ARTIFACT_DIR/generated-agent-metrics-$count.json" <<'PY'
import json
import pathlib
import re
import sys

pattern = re.compile(
    r"^(?P<timestamp>\S+ \S+) .*SendMetric : opscotch_agent_"
    r"(?P<name>.*), value: (?P<value>-?[0-9]+(?:\.[0-9]+)?)$"
)
records = []
for line in pathlib.Path(sys.argv[1]).read_text(errors="replace").splitlines():
    match = pattern.match(line)
    if match:
        records.append(
            {
                "timestamp": match.group("timestamp"),
                "name": match.group("name"),
                "value": float(match.group("value")),
                "captureSource": "local-diagnostic-log",
            }
        )
pathlib.Path(sys.argv[2]).write_text(
    json.dumps(records, indent=2, sort_keys=True) + "\n"
)
PY

    local activations
    activations="$(
        grep -c 'Startup activation complete for deploymentId: overlap-.*activated=true' \
            "$agent_log" || true
    )"
    if (( activations < count )); then
        printf 'Phase %s: expected %s activation records, found %s\n' \
            "$count" "$count" "$activations" >&2
        return 1
    fi
    assert_outputs "$count"

    local stop_started=$SECONDS
    docker stop --time "$STOP_LIMIT_SECONDS" "$agent_container" >/dev/null
    local stop_elapsed=$((SECONDS - stop_started))
    docker rm "$agent_container" >/dev/null

    if (( stop_elapsed > STOP_LIMIT_SECONDS + 2 )); then
        printf 'Phase %s: shutdown took %ss (limit %ss)\n' \
            "$count" "$stop_elapsed" "$STOP_LIMIT_SECONDS" >&2
        return 1
    fi

    wait_for_slow_requests_to_drain
    printf 'Phase %s passed: heartbeat and HTTP collection remained active; shutdown=%ss\n' \
        "$count" "$stop_elapsed"
}

run_phase 6
run_phase 7

python3 - "$temp_dir/state/concurrency.json" "$ARTIFACT_DIR" <<'PY'
import json
import pathlib
import sys

state = json.loads(pathlib.Path(sys.argv[1]).read_text())
print(f"Maximum concurrent deliberately slow requests: {state['maximumSlowRequests']}")

interesting_prefixes = (
    "timer_trigger_delay",
    "timer_trigger_drift",
    "worker_pool_",
    "jvm_threads_",
    "jvm_memory_",
    "jvm_gc_",
    "http_failure",
    "http_success",
    "step_http_duration",
    "send_queue",
    "netty_eventexecutor_tasks_pending",
)
artifact_dir = pathlib.Path(sys.argv[2])
for deployment_count in (6, 7):
    path = artifact_dir / f"agent-metrics-{deployment_count}.json"
    delivered = json.loads(path.read_text()) if path.exists() else []
    generated_path = artifact_dir / f"generated-agent-metrics-{deployment_count}.json"
    generated = json.loads(generated_path.read_text()) if generated_path.exists() else []
    records = delivered if delivered else generated
    selected = [
        record for record in records
        if str(record.get("name", "")).startswith(interesting_prefixes)
    ]
    names = sorted({str(record.get("name")) for record in selected})
    print(
        f"Phase {deployment_count}: generated {len(generated)}, delivered "
        f"{len(delivered)}, retained {len(selected)} diagnostic samples "
        f"across {len(names)} metric names"
    )
    (artifact_dir / f"diagnostic-agent-metrics-{deployment_count}.json").write_text(
        json.dumps(selected, indent=2, sort_keys=True) + "\n"
    )
print(f"Artifacts: {artifact_dir}")
PY
