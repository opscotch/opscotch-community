#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-120}"
BASELINE_TOLERANCE_MS="${INTEGRATION_TEST_TOLERANCE_MS:-1000}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-timer-stagger.XXXXXX")"
artifact_root="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
artifact_dir="$artifact_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
agent_container="opscotch-timer-stagger-$$"
receiver_pid=""
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"
baseline_offset_file="$temp_dir/baseline-offset.json"

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$temp_dir/state/failure.txt" \
            "$temp_dir/state/metric.received" \
            "$temp_dir/state/received-metrics.json"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- agent log tail ---\n' >&2
        if [[ -f "$temp_dir/agent.log" ]]; then
            tail -200 "$temp_dir/agent.log" >&2 || true
        else
            for container in \
                "${agent_container}-baseline" \
                "${agent_container}-staggered" \
                "$agent_container"
            do
                docker logs "$container" 2>&1 | tail -200 >&2 || true
            done
        fi
    fi

    for container in \
        "$agent_container-baseline" \
        "$agent_container-staggered" \
        "$agent_container"
    do
        docker rm -f "$container" >/dev/null 2>&1 || true
    done
    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" >/dev/null 2>&1 || true
        wait "$receiver_pid" >/dev/null 2>&1 || true
    fi

    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$artifact_dir" "$temp_dir/state"
port="$(python3 "$SCENARIO_DIR/reserve_port.py")"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$port" \
    --output-directory "$artifact_dir/fixtures"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$port" \
    --expected-metric-name "workflow-timer-staggered-startup-delay-metric" \
    --state-directory "$temp_dir/state" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_health() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            return 0
        fi
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for receiver health on port %s\n' "$port" >&2
    return 1
}

wait_for_marker() {
    local marker="$1"
    local description="$2"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        fi
        if [[ -s "$temp_dir/state/$marker" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$description" >&2
    return 1
}

wait_for_agent_log_line() {
    local container="$1"
    local pattern="$2"
    local description="$3"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker logs "$container" 2>&1 | grep -qF "$pattern"; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$description" >&2
    return 1
}

parse_phase_output() {
    local log_file="$1"
    local metrics_file="$2"
    local output_file="$3"
    python3 - "$log_file" "$metrics_file" "$output_file" <<'PY'
import datetime as dt
import json
import pathlib
import re
import sys

log_path = pathlib.Path(sys.argv[1])
metrics_path = pathlib.Path(sys.argv[2])
output_path = pathlib.Path(sys.argv[3])

startup_pattern = re.compile(
    r"^(?P<timestamp>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}[+-]\d{4}) .*"
    r"Agent startup complete and ready in (?P<duration>\d+)ms$"
)
stagger_pattern = re.compile(
    r"Workflow timer stagger requested for timer (?P<timer>.+?): created startup delay "
    r"(?P<delay>\d+)ms \(staggerPct=(?P<pct>\d+), maxStaggerDelay=(?P<max>\d+), "
    r"staggerOffset=(?P<offset>\d+)ms\)"
)

startup_timestamp = None
startup_duration = None
stagger = None
for line in log_path.read_text(errors="replace").splitlines():
    startup_match = startup_pattern.match(line)
    if startup_match is not None:
        startup_timestamp = dt.datetime.strptime(
            startup_match.group("timestamp"),
            "%Y-%m-%d %H:%M:%S.%f%z",
        )
        startup_duration = int(startup_match.group("duration"))
    stagger_match = stagger_pattern.search(line)
    if stagger_match is not None:
        stagger = {
            "timer": stagger_match.group("timer"),
            "delay": int(stagger_match.group("delay")),
            "pct": int(stagger_match.group("pct")),
            "max": int(stagger_match.group("max")),
            "offset": int(stagger_match.group("offset")),
        }

metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else []
if len(metrics) != 1:
    raise SystemExit(f"Expected exactly one workflow metric, found {len(metrics)}")
metric = metrics[0]
try:
    metric_timestamp = int(metric["timestamp"])
except (KeyError, TypeError, ValueError) as error:
    raise SystemExit(f"Invalid metric timestamp: {error}")

if startup_timestamp is None:
    raise SystemExit("Agent startup complete log line was not found")

output_path.write_text(
    json.dumps(
        {
            "startupTimestampMs": int(startup_timestamp.timestamp() * 1000),
            "startupDurationMs": startup_duration,
            "metricTimestampMs": metric_timestamp,
            "stagger": stagger,
            "metricName": metric.get("name"),
        },
        indent=2,
        sort_keys=True,
    )
    + "\n"
)
PY
}

run_phase() {
    local phase_name="$1"
    local bootstrap_file="$2"
    local expect_stagger="$3"
    local phase_dir="$temp_dir/$phase_name"
    local phase_state="$phase_dir/state"
    local phase_persistence="$phase_dir/persistence"
    local phase_log="$phase_dir/agent.log"
    local phase_output="$phase_dir/observed.json"
    local phase_container="${agent_container}-${phase_name}"
    local phase_persistence_root="$phase_persistence/workflow-timer-staggered-startup-delay/$phase_name"

    mkdir -p \
        "$phase_state" \
        "$phase_persistence_root/metrics" \
        "$phase_persistence_root/logs"
    docker rm -f "$phase_container" >/dev/null 2>&1 || true

    curl --silent --show-error --fail \
        --request POST \
        "http://127.0.0.1:$port/reset" >/dev/null

    docker run --detach \
        --name "$phase_container" \
        --network host \
        --volume "$artifact_dir/fixtures:/fixtures:ro" \
        --volume "$phase_persistence:/persistence" \
        --volume "$temp_dir:/artifacts" \
        --env BOOTSTRAP_FILE="/fixtures/$bootstrap_file" \
        --env OPSCOTCH_ACCEPT_LEGAL=yes \
        "$AGENT_IMAGE" >/dev/null

    wait_for_marker "metric.received" "workflow metric receipt"
    wait_for_agent_log_line "$phase_container" "Agent startup complete and ready in" "agent startup completion"

    docker stop --time 10 "$phase_container" >/dev/null
    docker logs "$phase_container" >"$phase_log" 2>&1
    docker rm "$phase_container" >/dev/null

    parse_phase_output "$phase_log" "$temp_dir/state/received-metrics.json" "$phase_output"

    cp "$phase_log" "$artifact_dir/$phase_name-agent.log"
    cp "$phase_output" "$artifact_dir/$phase_name-observed.json"
    cp "$temp_dir/state/received-metrics.json" "$artifact_dir/$phase_name-received-metrics.json"

    python3 - "$phase_output" "$expect_stagger" "$BASELINE_TOLERANCE_MS" "$baseline_offset_file" <<'PY'
import json
import pathlib
import sys

phase = json.loads(pathlib.Path(sys.argv[1]).read_text())
expect_stagger = sys.argv[2] == "yes"
tolerance_ms = int(sys.argv[3])
baseline_path = pathlib.Path(sys.argv[4])

startup_ts = phase["startupTimestampMs"]
metric_ts = phase["metricTimestampMs"]
offset_ms = metric_ts - startup_ts
if offset_ms < -tolerance_ms:
    raise SystemExit(
        f"Metric timestamp {metric_ts} is too far before startup completion "
        f"{startup_ts} (offset {offset_ms}ms)"
    )
if expect_stagger:
    stagger = phase["stagger"]
    expected_offset = None
    if stagger is not None:
        expected_offset = stagger["delay"]
    if expected_offset is None:
        raise SystemExit("Expected stagger delay was not captured")
    baseline = json.loads(baseline_path.read_text()) if baseline_path.exists() else None
    if baseline is None:
        raise SystemExit("Missing baseline offset from phase 1")
    expected_metric_offset = baseline["offsetMs"] + expected_offset
    if abs(offset_ms - expected_metric_offset) > tolerance_ms:
        raise SystemExit(
            f"Staggered metric timestamp mismatch\n"
            f"baseline offset: {baseline['offsetMs']}ms\n"
            f"expected delay:   {expected_offset}ms\n"
            f"expected offset:  {expected_metric_offset}ms\n"
            f"actual offset:    {offset_ms}ms\n"
            f"tolerance:        {tolerance_ms}ms"
        )
else:
    baseline_path.write_text(json.dumps({"offsetMs": offset_ms}, indent=2) + "\n")
    if offset_ms < -tolerance_ms:
        raise SystemExit(
            f"Baseline metric timestamp is unexpectedly far before startup completion: "
            f"{offset_ms}ms"
        )
print(
    f"{'staggered' if expect_stagger else 'baseline'} phase: "
    f"startup={startup_ts} metric={metric_ts} offset={offset_ms}ms"
)
PY
}

wait_for_health

run_phase "baseline" "bootstrap-baseline.json" "no"
run_phase "staggered" "bootstrap-staggered.json" "yes"

printf 'Verified bootstrap.workflow.timers.staggerPct shifts the first timer metric by the logged startup delay\n'
