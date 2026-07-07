#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-180}"
MAX_RUNTIME_SECONDS="${WORKER_POOL_MAX_RUNTIME_SECONDS:-}"
STAGE_COUNT="${WORKER_POOL_STAGE_COUNT:-20}"
STAGE_SPACING_SECONDS="${WORKER_POOL_STAGE_SPACING_SECONDS:-60}"
TIMER_PERIOD_MS="${WORKER_POOL_TIMER_PERIOD_MS:-1000}"
WORK_DELAY_MS="${WORKER_POOL_WORK_DELAY_MS:-10000}"
SETTLE_SECONDS="${WORKER_POOL_SETTLE_SECONDS:-10}"
TIMER_ACTIVE_MAX="${WORKER_POOL_TIMER_ACTIVE_MAX:-1000}"

for command in curl docker go python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    fi
done

if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

if [[ "$STAGE_COUNT" -le 0 ]]; then
    printf 'WORKER_POOL_STAGE_COUNT must be greater than zero\n' >&2
    exit 2
fi
if [[ -z "$MAX_RUNTIME_SECONDS" ]]; then
    MAX_RUNTIME_SECONDS=$((STAGE_COUNT * STAGE_SPACING_SECONDS + 600))
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-worker-pool.XXXXXX")"
artifact_root="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
artifact_dir="$artifact_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
target_container="opscotch-worker-pool-target-$$"
target_pid=""
current_receiver_pid=""
current_agent_container=""
current_agent_log_monitor_pid=""
target_state_dir="$temp_dir/target-state"
collector_state_dir="$temp_dir/collector-state"
persistence_dir="$temp_dir/persistence"
target_log="$temp_dir/target.log"
receiver_log="$temp_dir/receiver.log"
agent_log="$temp_dir/agent.log"
first_error_file="$temp_dir/first-agent-error.txt"

copy_if_present() {
    local source="$1"
    local destination="$2"

    if [[ -f "$source" ]]; then
        cp -f "$source" "$destination"
    fi
}

preserve_run_artifacts() {
    mkdir -p "$artifact_dir"
    copy_if_present "$target_log" "$artifact_dir/target.log"
    copy_if_present "$receiver_log" "$artifact_dir/receiver.log"
    copy_if_present "$agent_log" "$artifact_dir/agent.log"
    copy_if_present "$first_error_file" "$artifact_dir/first-agent-error.txt"
    if [[ -d "$collector_state_dir" ]]; then
        mkdir -p "$artifact_dir/collector-state"
        cp -R "$collector_state_dir/." "$artifact_dir/collector-state/"
    fi
    copy_if_present "$target_state_dir/state.json" "$artifact_dir/target-state.json"
    copy_if_present "$target_state_dir/events.ndjson" "$artifact_dir/events.ndjson"
}

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- collector state ---\n' >&2
        for file in \
            "$collector_state_dir/failure.txt" \
            "$collector_state_dir/counts.json" \
            "$collector_state_dir/complete.txt" \
            "$collector_state_dir/pressure.txt" \
            "$collector_state_dir/received-metrics.json" \
            "$collector_state_dir/received-logs.json" \
            "$collector_state_dir/received-agent-metrics.json" \
            "$target_state_dir/state.json" \
            "$target_state_dir/events.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- agent log tail ---\n' >&2
        if [[ -f "$agent_log" ]]; then
            tail -200 "$agent_log" >&2 || true
        fi
        printf '\n--- receiver log tail ---\n' >&2
        if [[ -f "$receiver_log" ]]; then
            tail -200 "$receiver_log" >&2 || true
        fi
        printf '\n--- target log tail ---\n' >&2
        if [[ -f "$target_log" ]]; then
            tail -200 "$target_log" >&2 || true
        fi
    fi

    preserve_run_artifacts

    docker rm -f "$target_container" >/dev/null 2>&1 || true
    if [[ -n "$current_agent_container" ]]; then
        docker rm -f "$current_agent_container" >/dev/null 2>&1 || true
    fi
    if [[ -n "$current_receiver_pid" ]]; then
        kill "$current_receiver_pid" >/dev/null 2>&1 || true
        wait "$current_receiver_pid" >/dev/null 2>&1 || true
    fi
    if [[ -n "$current_agent_log_monitor_pid" ]]; then
        kill "$current_agent_log_monitor_pid" >/dev/null 2>&1 || true
        wait "$current_agent_log_monitor_pid" >/dev/null 2>&1 || true
    fi
    if [[ -n "$target_pid" ]]; then
        kill "$target_pid" >/dev/null 2>&1 || true
        wait "$target_pid" >/dev/null 2>&1 || true
    fi

    if (( status != 0 )) && [[ "${KEEP_FAILED_INTEGRATION_TEST:-0}" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$artifact_dir" "$target_state_dir" "$collector_state_dir" "$persistence_dir"
mkdir -p \
    "$persistence_dir/worker-pool-saturation-01/metrics" \
    "$persistence_dir/worker-pool-saturation-01/logs"
read -ra reserved_ports <<<"$(
    python3 "$SCENARIO_DIR/reserve_ports.py" 2
)"
collector_port="${reserved_ports[0]}"
target_port="${reserved_ports[1]}"

(
    cd "$SCENARIO_DIR"
    go build -o "$temp_dir/worker-pool-saturation" .
)

"$temp_dir/worker-pool-saturation" \
    --port "$target_port" \
    --state-directory "$target_state_dir" \
    --default-delay-ms 0 \
    >"$target_log" 2>&1 &
target_pid=$!

wait_for_url() {
    local url="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.2
    done
    printf 'Timed out waiting for %s\n' "$url" >&2
    return 1
}

reset_target() {
    curl --silent --show-error --fail \
        --request POST \
        "http://127.0.0.1:$target_port/reset" >/dev/null
}

start_agent_log_monitor() {
    python3 - "$current_agent_container" "$agent_log" "$first_error_file" <<'PY' &
import pathlib
import subprocess
import sys

container = sys.argv[1]
log_path = pathlib.Path(sys.argv[2])
error_path = pathlib.Path(sys.argv[3])

log_path.parent.mkdir(parents=True, exist_ok=True)
proc = subprocess.Popen(
    ["docker", "logs", "--follow", "--timestamps", "--since", "0s", container],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
)

first_error = None
try:
    with log_path.open("a", encoding="utf-8") as log:
        assert proc.stdout is not None
        for line in proc.stdout:
            log.write(line)
            log.flush()
            if first_error is None and " ERROR " in line and "[Error Occurred After Shutdown]" not in line:
                first_error = line.rstrip("\n")
                error_path.write_text(first_error + "\n")
finally:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
PY
    current_agent_log_monitor_pid=$!
}

wait_for_first_error_or_timeout() {
    local deadline=$((SECONDS + MAX_RUNTIME_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$first_error_file" ]]; then
            return 0
        fi
        if [[ -n "$current_agent_log_monitor_pid" ]] && ! kill -0 "$current_agent_log_monitor_pid" >/dev/null 2>&1; then
            if [[ -s "$first_error_file" ]]; then
                return 0
            fi
            printf 'Agent log monitor exited before an error log was observed\n' >&2
            return 1
        fi
        sleep 0.5
    done
    printf 'Timed out waiting for agent error log\n' >&2
    return 1
}

wait_for_url "http://127.0.0.1:$target_port/health"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --collector-port "$collector_port" \
    --target-port "$target_port" \
    --stage-count "$STAGE_COUNT" \
    --stage-spacing-ms "$((STAGE_SPACING_SECONDS * 1000))" \
    --timer-period-ms "$TIMER_PERIOD_MS" \
    --work-delay-ms "$WORK_DELAY_MS" \
    --output-directory "$artifact_dir/fixtures"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$collector_port" \
    --expected-metrics 0 \
    --expected-logs 0 \
    --state-directory "$collector_state_dir" \
    >"$receiver_log" 2>&1 &
current_receiver_pid=$!

wait_for_url "http://127.0.0.1:$collector_port/health"
reset_target
curl --silent --show-error --fail \
    --request POST \
    "http://127.0.0.1:$collector_port/reset" >/dev/null

current_agent_container="opscotch-worker-pool-$$"
docker rm -f "$current_agent_container" >/dev/null 2>&1 || true
printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker run --detach \
    --name "$current_agent_container" \
    --network host \
    --volume "$artifact_dir/fixtures:/fixtures:ro" \
    --volume "$persistence_dir:/persistence" \
    --env BOOTSTRAP_FILE="/fixtures/bootstrap.json" \
    --env OPSCOTCH_ACCEPT_LEGAL=yes \
    --env "OPSCOTCH_TIMER_ACTIVE_MAX=$TIMER_ACTIVE_MAX" \
    --env "OPSCOTCH_AGENT_METRIC_PROPERTIES=url=http://127.0.0.1:$collector_port/agent-metrics;token=worker-pool-saturation-native" \
    "$AGENT_IMAGE" >/dev/null
start_agent_log_monitor

run_failed=0
stop_reason=""
if ! wait_for_first_error_or_timeout; then
    run_failed=1
    if ! kill -0 "$current_agent_log_monitor_pid" >/dev/null 2>&1; then
        stop_reason="monitor-exit"
    else
        stop_reason="timeout"
    fi
    docker stop --time 10 "$current_agent_container" >/dev/null 2>&1 || true
else
    stop_reason="first-error-log"
fi

docker stop --time 10 "$current_agent_container" >/dev/null 2>&1 || true
docker rm "$current_agent_container" >/dev/null 2>&1 || true

sleep "$SETTLE_SECONDS"

wait "$current_agent_log_monitor_pid" >/dev/null 2>&1 || true
current_agent_log_monitor_pid=""

kill "$current_receiver_pid" >/dev/null 2>&1 || true
wait "$current_receiver_pid" >/dev/null 2>&1 || true
current_receiver_pid=""

preserve_run_artifacts

python3 - "$artifact_dir" "$target_state_dir" "$collector_state_dir" "$first_error_file" "$stop_reason" "$STAGE_COUNT" "$STAGE_SPACING_SECONDS" "$TIMER_PERIOD_MS" "$WORK_DELAY_MS" <<'PY'
import json
import math
import pathlib
import sys
from urllib.parse import parse_qs

artifact_dir = pathlib.Path(sys.argv[1])
target_state_dir = pathlib.Path(sys.argv[2])
collector_state_dir = pathlib.Path(sys.argv[3])
first_error_path = pathlib.Path(sys.argv[4])
stop_reason = sys.argv[5]
stage_count = int(sys.argv[6])
stage_spacing_seconds = int(sys.argv[7])
timer_period_ms = int(sys.argv[8])
work_delay_ms = int(sys.argv[9])

counts_path = collector_state_dir / "counts.json"
state_path = target_state_dir / "state.json"
events_path = target_state_dir / "events.ndjson"
agent_metrics_path = collector_state_dir / "received-agent-metrics.json"

counts = json.loads(counts_path.read_text()) if counts_path.exists() else {}
state = json.loads(state_path.read_text()) if state_path.exists() else {}
agent_metrics = json.loads(agent_metrics_path.read_text()) if agent_metrics_path.exists() else []
first_error_log = first_error_path.read_text().strip() if first_error_path.exists() else ""

expected_per_stage_concurrency = max(1, math.ceil(work_delay_ms / timer_period_ms))
expected_peak_concurrency = stage_count * expected_per_stage_concurrency

stages = {
    stage_number: {
        "stage": stage_number,
        "stepId": f"burst-{stage_number:02d}",
        "triggerDelayMs": (stage_number - 1) * stage_spacing_seconds * 1000,
        "requestedConcurrency": stage_number * expected_per_stage_concurrency,
        "requests": 0,
        "completedRequests": 0,
        "failedRequests": 0,
        "canceledRequests": 0,
        "maxActiveRequests": 0,
        "maxActiveConnections": 0,
        "pressureObserved": False,
    }
    for stage_number in range(1, stage_count + 1)
}

if events_path.exists():
    for raw_line in events_path.read_text().splitlines():
        if not raw_line.strip():
            continue
        event = json.loads(raw_line)
        if event.get("type") != "request":
            continue
        stage_value = parse_qs(str(event.get("query", ""))).get("stage", [""])[0]
        try:
            stage_number = int(stage_value)
        except ValueError:
            continue
        bucket = stages.get(stage_number)
        if bucket is None:
            continue
        status_code = int(event.get("statusCode", 0))
        bucket["requests"] += 1
        bucket["maxActiveRequests"] = max(bucket["maxActiveRequests"], int(event.get("maxActiveRequests", 0)))
        bucket["maxActiveConnections"] = max(bucket["maxActiveConnections"], int(event.get("maxActiveConnections", 0)))
        if status_code < 400:
            bucket["completedRequests"] += 1
        elif status_code == 499:
            bucket["canceledRequests"] += 1
        else:
            bucket["failedRequests"] += 1

stage_summaries = [stages[index] for index in range(1, stage_count + 1)]
capacity_stage = 0
pressure_stage = None
for stage in stage_summaries:
    stage["pressureObserved"] = stage["maxActiveRequests"] < stage["requestedConcurrency"]
    if stage["pressureObserved"]:
        pressure_stage = pressure_stage or stage["stage"]
    else:
        capacity_stage = stage["stage"]

summary = {
    "stageCount": stage_count,
    "stageSpacingSeconds": stage_spacing_seconds,
    "timerPeriodMs": timer_period_ms,
    "workDelayMs": work_delay_ms,
    "rampDurationSeconds": stage_count * stage_spacing_seconds,
    "stopReason": stop_reason,
    "firstErrorLog": first_error_log,
    "expectedConcurrencyPerStage": expected_per_stage_concurrency,
    "expectedPeakConcurrency": expected_peak_concurrency,
    "observedPeakConcurrency": int(state.get("maxActiveRequests", 0)),
    "capacityStage": capacity_stage,
    "pressureStage": pressure_stage,
    "pressureObserved": bool(first_error_log) or int(state.get("maxActiveRequests", 0)) < expected_peak_concurrency,
    "metrics": int(counts.get("metrics", 0)),
    "logs": int(counts.get("logs", 0)),
    "agentMetrics": int(counts.get("agentMetrics", 0)),
    "totalRequests": int(state.get("totalRequests", 0)),
    "completedRequests": int(state.get("completedRequests", 0)),
    "failedRequests": int(state.get("failedRequests", 0)),
    "canceledRequests": int(state.get("canceledRequests", 0)),
    "maxActiveRequests": int(state.get("maxActiveRequests", 0)),
    "maxActiveConnections": int(state.get("maxActiveConnections", 0)),
    "agentMetricNames": sorted(
        {
            str(record.get("name"))
            for record in agent_metrics
            if isinstance(record, dict) and record.get("name")
        }
    ),
    "stages": stage_summaries,
}

(artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
(artifact_dir / "capacity-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")

print(
    f"capacityStage={summary['capacityStage']} "
    f"pressureStage={summary['pressureStage']} "
    f"stopReason={summary['stopReason']} "
    f"expectedPeakConcurrency={summary['expectedPeakConcurrency']} "
    f"observedPeakConcurrency={summary['maxActiveRequests']}"
)
for stage in stage_summaries:
    print(
        f"stage={stage['stage']} requests={stage['requests']} "
        f"requestedConcurrency={stage['requestedConcurrency']} "
        f"maxActiveRequests={stage['maxActiveRequests']} "
        f"pressure={'yes' if stage['maxActiveRequests'] < stage['requestedConcurrency'] else 'no'}"
    )
print(f"Artifacts: {artifact_dir}")
PY

if (( run_failed != 0 )); then
    exit 1
fi
