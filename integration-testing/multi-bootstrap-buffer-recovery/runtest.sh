#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
DEPLOYMENT_COUNT=20

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
receiver_label=""

cleanup() {
    status=$?
    if (( status != 0 )); then
        printf '\n--- receiver log ---\n' >&2
        tail -100 "$temp_dir/receiver-$receiver_label.log" >&2 2>/dev/null || true
        printf '\n--- agent log ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -300 >&2 || true
    fi

    stop_receiver >/dev/null 2>&1 || true
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "${KEEP_FAILED_INTEGRATION_TEST:-0}" == "1" ]]; then
        printf 'Preserved failed test artifacts in %s\n' "$temp_dir" >&2
        return
    fi
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
    local phase="${2:-}"
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
    printf 'Timed out waiting for outputs in %s\n' "$state_directory" >&2
    if [[ -n "$phase" ]]; then
        python3 - \
            "$temp_dir/fixtures/expected-$phase-metrics.json" \
            "$temp_dir/fixtures/expected-$phase-logs.json" \
            "$state_directory/received-metrics.json" \
            "$state_directory/received-logs.json" <<'PY'
import json
import pathlib
import sys

def tokens(path):
    path = pathlib.Path(path)
    return set(json.loads(path.read_text())) if path.exists() else set()

for kind, expected_path, received_path in (
    ("metrics", sys.argv[1], sys.argv[3]),
    ("logs", sys.argv[2], sys.argv[4]),
):
    expected = tokens(expected_path)
    received = tokens(received_path)
    missing = sorted(expected - received)
    print(
        f"{kind}: received={len(received)}/{len(expected)}, "
        f"missing sample={missing[:10]}",
        file=sys.stderr,
    )
PY
    fi
    return 1
}

start_receiver() {
    local phase="$1"
    local label="$2"
    local status="${3:-200}"
    local delay="${4:-0}"
    receiver_label="$label"
    local state_directory="$temp_dir/state-$label"
    mkdir -p "$state_directory"

    python3 "$SCENARIO_DIR/receiver.py" \
        --port "$receiver_port" \
        --expected-metrics "$temp_dir/fixtures/expected-$phase-metrics.json" \
        --expected-logs "$temp_dir/fixtures/expected-$phase-logs.json" \
        --state-directory "$state_directory" \
        --response-status "$status" \
        --response-delay "$delay" \
        >"$temp_dir/receiver-$label.log" 2>&1 &
    receiver_pid=$!
    wait_for_url "http://127.0.0.1:$receiver_port/health"
}

stop_receiver() {
    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" 2>/dev/null || true
        wait "$receiver_pid" 2>/dev/null || true
        receiver_pid=""
    fi
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
    local deployment_limit="${2:-$DEPLOYMENT_COUNT}"
    local index
    for ((index = 0; index < deployment_limit; index++)); do
        curl --silent --show-error --fail \
            --request POST \
            "http://127.0.0.1:${agent_ports[$index]}/emit-$phase" >/dev/null
    done
}

request_count() {
    local journal="$1"
    if [[ ! -s "$journal" ]]; then
        printf '0\n'
        return
    fi
    wc -l <"$journal"
}

assert_retries() {
    local journal="$1"
    local minimum="$2"
    local count
    count="$(request_count "$journal")"
    if (( count < minimum )); then
        printf 'Expected at least %s delivery attempts, found %s\n' \
            "$minimum" "$count" >&2
        return 1
    fi
}

assert_retry_cadence() {
    local journal="$1"
    python3 - "$journal" <<'PY'
import collections
import json
import pathlib
import statistics
import sys

entries = [
    json.loads(line)
    for line in pathlib.Path(sys.argv[1]).read_text().splitlines()
    if line.strip()
]
by_hash = collections.defaultdict(list)
for entry in entries:
    by_hash[entry["bodyHash"]].append(entry["timestamp"])

intervals = []
for timestamps in by_hash.values():
    timestamps.sort()
    intervals.extend(
        right - left for left, right in zip(timestamps, timestamps[1:])
    )

if not intervals:
    raise SystemExit("No repeated request body was observed")
median = statistics.median(intervals)
if not 0.5 <= median <= 2.5:
    raise SystemExit(f"Unexpected median retry interval: {median:.3f}s")
print(f"median retry interval={median:.2f}s")
PY
}

recover_phase() {
    local phase="$1"
    local label="$2"
    stop_receiver
    start_receiver "$phase" "$label"
    wait_for_outputs "$temp_dir/state-$label" "$phase"
    sleep 2
    stop_receiver
}

test_status_policy() {
    local phase="$1"
    local status="$2"
    local warning_pattern="${3:-}"
    local failure_label="$phase-failure"

    start_receiver "$phase" "$failure_label" "$status"
    trigger_phase "$phase"
    sleep 4
    assert_retries "$temp_dir/state-$failure_label/requests.ndjson" 60
    assert_retry_cadence "$temp_dir/state-$failure_label/requests.ndjson"

    if [[ -n "$warning_pattern" ]]; then
        docker logs "$agent_container" >"$temp_dir/$failure_label-agent.log" 2>&1
        first_warning_count="$(
            grep -c "$warning_pattern" "$temp_dir/$failure_label-agent.log" || true
        )"
        sleep 2
        docker logs "$agent_container" >"$temp_dir/$failure_label-agent-later.log" 2>&1
        later_warning_count="$(
            grep -c "$warning_pattern" "$temp_dir/$failure_label-agent-later.log" || true
        )"
        if (( first_warning_count == 0 || first_warning_count != later_warning_count )); then
            printf 'Warning suppression failed for HTTP %s: first=%s later=%s\n' \
                "$status" "$first_warning_count" "$later_warning_count" >&2
            return 1
        fi
    fi

    recover_phase "$phase" "$phase-recovery"
}

start_receiver online online
start_agent
wait_for_deployments
trigger_phase online
wait_for_outputs "$temp_dir/state-online" online
sleep 2
stop_receiver

# Connection refusal: warnings are emitted once per continuous outage and the
# payload remains available for recovery.
connection_warning='Connection Failure while trying to send data'
trigger_phase connection
sleep 4
docker logs "$agent_container" >"$temp_dir/connection-agent.log" 2>&1
first_connection_warnings="$(
    grep -c "$connection_warning" "$temp_dir/connection-agent.log" || true
)"
sleep 2
docker logs "$agent_container" >"$temp_dir/connection-agent-later.log" 2>&1
later_connection_warnings="$(
    grep -c "$connection_warning" "$temp_dir/connection-agent-later.log" || true
)"
if (( first_connection_warnings == 0
      || first_connection_warnings != later_connection_warnings )); then
    printf 'Connection warning suppression failed: first=%s later=%s\n' \
        "$first_connection_warnings" "$later_connection_warnings" >&2
    exit 1
fi
recover_phase connection connection-recovery

test_status_policy status-400 400 '400 error while trying to send data'
test_status_policy status-401 401 '401 error while trying to send data'
test_status_policy status-404 404 '402-499 error while trying to send data'
test_status_policy status-500 500
test_status_policy status-302 302

# A receiver that accepts requests but waits beyond the agent's 10-second HTTP
# timeout must leave the payload available for later delivery.
start_receiver timeout timeout-delay 200 15
trigger_phase timeout
sleep 12
docker logs "$agent_container" >"$temp_dir/timeout-agent.log" 2>&1
if ! grep -q "$connection_warning" "$temp_dir/timeout-agent.log"; then
    printf 'No connection failure was logged after delayed-response timeout\n' >&2
    exit 1
fi
recover_phase timeout timeout-recovery

# One sender emits 2,500 records. Successful metric requests must respect the
# queue's take(1000) batch boundary.
start_receiver batch batch
trigger_phase batch 1
wait_for_outputs "$temp_dir/state-batch" batch
python3 - "$temp_dir/state-batch/requests.ndjson" <<'PY'
import json
import pathlib
import sys

entries = [
    json.loads(line)
    for line in pathlib.Path(sys.argv[1]).read_text().splitlines()
    if line.strip()
]
metric_batches = [
    entry["recordCount"]
    for entry in entries
    if entry["path"] == "/metrics"
    and entry["sampleToken"]
    and "-batch-metric-" in entry["sampleToken"]
]
if not metric_batches or max(metric_batches) > 1000:
    raise SystemExit(
        f"Metric batch exceeded the 1,000-record boundary: {metric_batches}"
    )
print(
    f"metric batches={len(metric_batches)}, "
    f"largest batch={max(metric_batches)}"
)
PY

printf 'Verified connection, status, timeout, retry cadence, warning suppression, and batching across %s deployments\n' \
    "$DEPLOYMENT_COUNT"
