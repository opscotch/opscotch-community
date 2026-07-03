#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HOPSCOTCH_DIR="${HOPSCOTCH_DIR:-/home/jeremy/dev/opscotch/hopscotch}"
AGENT_JAR="${OPSCOTCH_AGENT_JAR:-$HOPSCOTCH_DIR/agent/target/quarkus-app/quarkus-run.jar}"
TIME_SCALE="${SCENARIO_TIME_SCALE:-0.1}"
PHASE_SECONDS="${INTEGRATION_TEST_PHASE_SECONDS:-75}"
PHASES="${INTEGRATION_TEST_PHASES:-6 7}"
OUTPUT_TOLERANCE_PERCENT="${INTEGRATION_TEST_OUTPUT_TOLERANCE_PERCENT:-65}"
STOP_LIMIT_SECONDS="${INTEGRATION_TEST_STOP_LIMIT_SECONDS:-15}"
MAX_LIVE_THREADS="${INTEGRATION_TEST_MAX_LIVE_THREADS:-100}"
SLOW_COLLECTORS_PER_TIMEOUT="${SLOW_COLLECTORS_PER_TIMEOUT:-2}"
ACTIVE_PROCESSORS="${OPSCOTCH_AGENT_ACTIVE_PROCESSORS:-1}"
MAX_HEAP="${OPSCOTCH_AGENT_MAX_HEAP:-512m}"
ARTIFACT_ROOT="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
ARTIFACT_DIR="$ARTIFACT_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-local-$$"

for command in curl java jcmd python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    fi
done
if [[ ! -f "$AGENT_JAR" ]]; then
    printf 'Agent runner not found: %s\nBuild it with: ./mvnw -pl agent -am package -DskipTests\n' \
        "$AGENT_JAR" >&2
    exit 2
fi
if (( OUTPUT_TOLERANCE_PERCENT < 1 || OUTPUT_TOLERANCE_PERCENT > 100 )); then
    printf 'INTEGRATION_TEST_OUTPUT_TOLERANCE_PERCENT must be between 1 and 100\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-seven-overlap-local.XXXXXX")"
server_pid=""
agent_pid=""

stop_process() {
    local pid="${1:-}"
    [[ -n "$pid" ]] || return 0
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
}

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\nScenario artifacts retained at %s\n' "$ARTIFACT_DIR" >&2
        for file in "$temp_dir"/state/*.json "$temp_dir"/state/failure.txt; do
            [[ -f "$file" ]] && { printf '\n%s\n' "$file" >&2; tail -100 "$file" >&2; }
        done
        [[ -f "$temp_dir/current-agent.log" ]] &&
            { printf '\nLatest agent log:\n' >&2; tail -250 "$temp_dir/current-agent.log" >&2; }
    fi
    stop_process "$agent_pid"
    stop_process "$server_pid"
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM
mkdir -p "$ARTIFACT_DIR" "$temp_dir/state"

port="$(python3 "$SCENARIO_DIR/reserve_port.py")"
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

wait_for_exit() {
    local pid="$1"
    local limit="$2"
    local deadline=$((SECONDS + limit))
    while kill -0 "$pid" 2>/dev/null; do
        (( SECONDS < deadline )) || return 1
        sleep 0.2
    done
}

wait_for_slow_requests_to_drain() {
    local deadline=$((SECONDS + 20))
    while (( SECONDS < deadline )); do
        if python3 - "$temp_dir/state/concurrency.json" <<'PY'
import json
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
try:
    state = json.loads(path.read_text())
except json.JSONDecodeError:
    raise SystemExit(1)
raise SystemExit(0 if state.get("activeSlowRequests", 0) == 0 else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    return 1
}

wait_for_agent_metrics() {
    local deadline=$((SECONDS + 15))
    while (( SECONDS < deadline )); do
        if python3 - "$temp_dir/state/agent-metrics.json" <<'PY'
import json
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
try:
    metrics = json.loads(path.read_text())
except json.JSONDecodeError:
    raise SystemExit(1)
raise SystemExit(0 if metrics else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    return 1
}

copy_json_snapshot() {
    local source="$1"
    local destination="$2"
    local deadline=$((SECONDS + 5))
    while (( SECONDS < deadline )); do
        if python3 - "$source" "$destination" <<'PY'
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
try:
    value = json.loads(source.read_text())
except (FileNotFoundError, json.JSONDecodeError):
    raise SystemExit(1)
destination.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
PY
        then
            return 0
        fi
        sleep 0.1
    done
    python3 - "$source" "$destination" <<'PY'
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
value = json.loads(source.read_text())
destination.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
PY
}

run_phase() {
    local count="$1"
    local fixtures="$temp_dir/fixtures-$count"
    local persistence="$temp_dir/persistence-$count"
    local agent_log="$ARTIFACT_DIR/agent-$count.log"
    local thread_samples="$ARTIFACT_DIR/thread-counts-$count.tsv"
    local thread_dump="$ARTIFACT_DIR/threads-$count.txt"
    local maximum_threads=0

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
    python3 - "$fixtures/bootstrap.json" "$fixtures" "$persistence" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
fixtures = pathlib.Path(sys.argv[2])
persistence = pathlib.Path(sys.argv[3])
definitions = json.loads(path.read_text())
for definition in definitions:
    definition["remoteConfiguration"] = str(
        fixtures / pathlib.Path(definition["remoteConfiguration"]).name
    )
    deployment_id = definition["deploymentId"]
    definition["persistenceRoot"] = str(persistence / deployment_id)
    definition["workflow"]["metricOutput"]["persistenceRoot"] = str(
        persistence / deployment_id / "metrics"
    )
path.write_text(json.dumps(definitions, indent=2) + "\n")
PY
    curl --silent --show-error --fail --request POST \
        "http://127.0.0.1:$port/reset" >/dev/null

    : >"$agent_log"
    ln -sf "$agent_log" "$temp_dir/current-agent.log"
    OPSCOTCH_AGENT_METRIC_PROPERTIES="url=http://127.0.0.1:$port/agent-metrics;token=stress-diagnostics-$count" \
        java -Dquarkus.profile=local \
        "-XX:ActiveProcessorCount=$ACTIVE_PROCESSORS" \
        "-Xmx$MAX_HEAP" \
        -jar "$AGENT_JAR" \
        "$fixtures/bootstrap.json" \
        --accept-legal=yes \
        >"$agent_log" 2>&1 &
    agent_pid=$!

    printf 'elapsedSeconds\tliveThreads\n' >"$thread_samples"
    local phase_started=$SECONDS
    while (( SECONDS - phase_started < PHASE_SECONDS )); do
        if ! kill -0 "$agent_pid" 2>/dev/null; then
            printf 'Phase %s: agent exited before observation completed\n' "$count" >&2
            return 1
        fi
        local threads
        threads="$(ps -o nlwp= -p "$agent_pid" | tr -d ' ')"
        threads="${threads:-0}"
        (( threads > maximum_threads )) && maximum_threads="$threads"
        printf '%s\t%s\n' "$((SECONDS - phase_started))" "$threads" >>"$thread_samples"
        sleep 1
    done
    # Metric collection begins on the one-minute schedule, but the buffered
    # sender can complete shortly after the observation boundary.
    wait_for_agent_metrics || true
    jcmd "$agent_pid" Thread.print >"$thread_dump"

    copy_json_snapshot "$temp_dir/state/metrics.json" \
        "$ARTIFACT_DIR/workflow-metrics-$count.json"
    copy_json_snapshot "$temp_dir/state/agent-metrics.json" \
        "$ARTIFACT_DIR/agent-metrics-$count.json"
    copy_json_snapshot "$temp_dir/state/concurrency.json" \
        "$ARTIFACT_DIR/concurrency-$count.json"

    python3 - "$agent_log" "$ARTIFACT_DIR/generated-agent-metrics-$count.json" <<'PY'
import json
import pathlib
import re
import sys

log = pathlib.Path(sys.argv[1]).read_text(errors="replace")
destination = pathlib.Path(sys.argv[2])
records = []
pattern = re.compile(r"SendMetric : opscotch_agent_([^,]+), value: ([^\s]+)")
for match in pattern.finditer(log):
    try:
        value = float(match.group(2))
    except ValueError:
        continue
    records.append({"name": match.group(1), "value": value})
destination.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n")
PY

    python3 - \
        "$temp_dir/state/metrics.json" \
        "$temp_dir/state/agent-metrics.json" \
        "$ARTIFACT_DIR/generated-agent-metrics-$count.json" \
        "$agent_log" \
        "$thread_dump" \
        "$count" \
        "$PHASE_SECONDS" \
        "$TIME_SCALE" \
        "$OUTPUT_TOLERANCE_PERCENT" \
        "$maximum_threads" \
        "$MAX_LIVE_THREADS" <<'PY'
import json
import math
import pathlib
import sys

(metrics_path, agent_metrics_path, generated_agent_metrics_path, log_path,
 dump_path, count, phase_seconds, time_scale, tolerance_percent,
 maximum_threads, maximum_allowed_threads) = sys.argv[1:]
count = int(count)
expected = math.floor(float(phase_seconds) / (10 * float(time_scale)))
minimum = math.floor(expected * int(tolerance_percent) / 100)
metrics = json.loads(pathlib.Path(metrics_path).read_text())
failures = []
for number in range(1, count + 1):
    for suffix in ("heartbeat", "fast"):
        name = f"overlap-{number}-{suffix}"
        actual = metrics.get(name, 0)
        if actual < minimum:
            failures.append(
                f"{name}: expected >= {minimum} ({tolerance_percent}% of "
                f"{expected} timer opportunities), received {actual}"
            )
agent_metrics = json.loads(pathlib.Path(agent_metrics_path).read_text())
generated_agent_metrics = json.loads(pathlib.Path(generated_agent_metrics_path).read_text())
if not generated_agent_metrics:
    failures.append("internal agent metrics were not generated during saturation")
log = pathlib.Path(log_path).read_text(errors="replace")
if "WRK_RESOURCE_LIMIT" not in log:
    failures.append("no observable timer admission rejection was logged")
if int(maximum_threads) > int(maximum_allowed_threads):
    failures.append(
        f"maximum live threads {maximum_threads} exceeded {maximum_allowed_threads}"
    )
dump = pathlib.Path(dump_path).read_text(errors="replace")
waiting_admission = dump.count("StepExecutionLimiter.acquireActivePermit")
if waiting_admission:
    failures.append(
        f"{waiting_admission} threads were blocked in workflow permit admission"
    )
if failures:
    raise SystemExit("\n".join(failures))
print(
    f"Phase {count}: minimum outputs={minimum}/{expected}, "
    f"generated agent metrics={len(generated_agent_metrics)}, "
    f"delivered agent metrics={len(agent_metrics)}, max threads={maximum_threads}"
)
PY

    local stop_started=$SECONDS
    kill "$agent_pid"
    if ! wait_for_exit "$agent_pid" "$STOP_LIMIT_SECONDS"; then
        jcmd "$agent_pid" Thread.print >"$ARTIFACT_DIR/shutdown-timeout-threads-$count.txt" ||
            true
        kill -KILL "$agent_pid" 2>/dev/null || true
        wait "$agent_pid" 2>/dev/null || true
        agent_pid=""
        printf 'Phase %s: shutdown exceeded %ss and required SIGKILL\n' \
            "$count" "$STOP_LIMIT_SECONDS" >&2
        return 1
    fi
    local agent_status=0
    wait "$agent_pid" || agent_status=$?
    agent_pid=""
    if (( agent_status != 0 && agent_status != 143 )); then
        printf 'Phase %s: agent exited with status %s after SIGTERM\n' \
            "$count" "$agent_status" >&2
        return 1
    fi
    local stop_elapsed=$((SECONDS - stop_started))

    if ! wait_for_slow_requests_to_drain; then
        printf 'Phase %s: fixture-server slow requests did not drain after shutdown\n' \
            "$count" >&2
        return 1
    fi
    printf 'Phase %s passed; shutdown=%ss\n' "$count" "$stop_elapsed"
}

for phase in $PHASES; do
    run_phase "$phase"
done

printf 'Artifacts: %s\n' "$ARTIFACT_DIR"
