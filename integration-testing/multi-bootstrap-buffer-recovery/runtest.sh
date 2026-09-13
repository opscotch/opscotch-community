#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
DEPLOYMENT_COUNT=20
project_name="opscotch-buffer-recovery-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

for command in docker python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    fi
done

# Use the user-provided OPSCOTCH_LEGAL_ACCEPTED from the shell environment; do not hardcode a value here.
if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-buffer-recovery.XXXXXX")"
current_state_dir=""

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 250 >&2 || true
        printf '\n--- receiver state ---\n' >&2
        if [[ -n "$current_state_dir" ]]; then
            for file in \
                "$current_state_dir/failure.txt" \
                "$current_state_dir/all-outputs.received" \
                "$current_state_dir/received-metrics.json" \
                "$current_state_dir/received-logs.json"
            do
                if [[ -f "$file" ]]; then
                    printf '\n%s\n' "$file" >&2
                    cat "$file" >&2
                fi
            done
        fi
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf 'Preserved failed test artifacts in %s\n' "$temp_dir" >&2
        return
    fi
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

read -ra reserved_ports <<<"$(
    python3 "$SCENARIO_DIR/reserve_ports.py" "$DEPLOYMENT_COUNT"
)"
agent_ports=("${reserved_ports[@]}")
agent_ports_csv="$(IFS=,; printf '%s' "${agent_ports[*]}")"

mkdir -p "$temp_dir/fixtures" "$temp_dir/persistence"
for deployment_number in $(seq 1 "$DEPLOYMENT_COUNT"); do
    mkdir -p \
        "$temp_dir/persistence/buffer-recovery-$deployment_number/metrics" \
        "$temp_dir/persistence/buffer-recovery-$deployment_number/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --agent-ports "$agent_ports_csv" \
    --output-directory "$temp_dir/fixtures"

export SCENARIO_DIR FIXTURE_DIR="$temp_dir/fixtures" STATE_DIR="$temp_dir/state" PERSISTENCE_DIR="$temp_dir/persistence" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_url() {
    local url="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker compose -p "$project_name" -f "$compose_file" exec -T client python3 - "$url" <<'PY'
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=3) as response:
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
    local state_directory="$temp_dir/state-$label"
    mkdir -p "$state_directory"
    current_state_dir="$state_directory"

    export EXPECTED_METRICS_FILE="expected-$phase-metrics.json" \
        EXPECTED_LOGS_FILE="expected-$phase-logs.json" \
        STATE_DIR="$state_directory" \
        RESPONSE_STATUS="$status" \
        RESPONSE_DELAY="$delay"
    docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --force-recreate receiver client >/dev/null
    wait_for_url "http://receiver:8080/health"
}

start_agent() {
    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans agent >/dev/null
}

wait_for_deployments() {
    local port
    for port in "${agent_ports[@]}"; do
        wait_for_url "http://agent:$port/health"
    done
}

capture_agent_logs() {
    docker compose -p "$project_name" -f "$compose_file" logs --no-color agent
}

wait_for_deployment_activation() {
    local activation_log="$temp_dir/activation.log"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))

    # A listener can answer /health before all registries have completed their
    # startup work.  Gate the load test on the agent's explicit completion log
    # for every deployment instead of assuming a fixed startup duration.
    while (( SECONDS < deadline )); do
        capture_agent_logs >"$activation_log" 2>&1
        local activated
        activated="$(
            { grep -E 'Startup activation complete for deploymentId: buffer-recovery-[0-9]+, activated=true' "$activation_log" || true; } \
                | sed -E 's/.*deploymentId: (buffer-recovery-[0-9]+), activated=true.*/\1/' \
                | sort -u \
                | wc -l
        )"
        if (( activated == DEPLOYMENT_COUNT )); then
            printf 'Observed startup activation completion for %s deployments\n' "$activated" >&2
            return 0
        fi
        if grep -q 'Startup activation failed for deploymentId:' "$activation_log"; then
            printf 'Agent reported a deployment activation failure\n' >&2
            return 1
        fi
        sleep 0.25
    done

    printf 'Timed out waiting for deployment activation; observed %s/%s completion logs\n' \
        "$activated" "$DEPLOYMENT_COUNT" >&2
    return 1
}

agent_log_count() {
    local pattern="$1"
    local log_file="$2"
    capture_agent_logs >"$log_file" 2>&1
    grep -c "$pattern" "$log_file" || true
}

assert_warning_suppressed() {
    local label="$1"
    local warning_pattern="$2"
    local baseline="$3"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    local stable_count=""
    local stable_since=0
    local count

    # The connection phase starts work asynchronously.  Rather than sampling
    # in the middle of first attempts, wait until warning production has
    # quiesced after the activation barrier.  Repeated warnings prevent this
    # condition and time out, which is the failure this assertion is intended
    # to detect.
    while (( SECONDS < deadline )); do
        count="$(agent_log_count "$warning_pattern" "$temp_dir/$label-agent.log")"
        if (( count > baseline )); then
            if [[ "$count" == "$stable_count" ]]; then
                if (( SECONDS - stable_since >= 3 )); then
                    break
                fi
            else
                stable_count="$count"
                stable_since=$SECONDS
            fi
        fi
        sleep 0.25
    done

    if [[ -z "$stable_count" ]] || (( SECONDS >= deadline )); then
        printf 'Warnings did not quiesce for %s: baseline=%s latest=%s\n' \
            "$label" "$baseline" "${count:-0}" >&2
        return 1
    fi

    sleep 2
    local later_count
    later_count="$(agent_log_count "$warning_pattern" "$temp_dir/$label-agent-later.log")"
    if (( later_count != stable_count )); then
        printf 'Warning suppression failed for %s: stable=%s later=%s\n' \
            "$label" "$stable_count" "$later_count" >&2
        return 1
    fi
}

trigger_phase() {
    local phase="$1"
    local deployment_limit="${2:-$DEPLOYMENT_COUNT}"
    local index
    for ((index = 0; index < deployment_limit; index++)); do
        docker compose -p "$project_name" -f "$compose_file" exec -T client python3 - \
            "${agent_ports[$index]}" "$phase" <<'PY'
import sys
import urllib.request

port = sys.argv[1]
phase = sys.argv[2]
with urllib.request.urlopen(
    urllib.request.Request(
        f"http://agent:{port}/emit-{phase}",
        method="POST",
    ),
    timeout=10,
) as response:
    response.read()
PY
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

assert_uniform_policy() {
    local journal="$1"
    local policy="$2"
    python3 - "$journal" "$DEPLOYMENT_COUNT" "$policy" <<'PY'
import collections
import json
import pathlib
import statistics
import sys

path = pathlib.Path(sys.argv[1])
deployment_count = int(sys.argv[2])
policy = sys.argv[3]
entries = (
    [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if path.exists()
    else []
)
attempts = collections.defaultdict(list)
for entry in entries:
    for deployment in entry.get("deployments", []):
        attempts[(deployment, entry["path"])].append(entry["timestamp"])

missing_initial = []
missing_retry = []
unexpected_retry = []
bad_cadence = []
for deployment in map(str, range(1, deployment_count + 1)):
    for path_name in ("/metrics", "/logs"):
        timestamps = sorted(attempts[(deployment, path_name)])
        name = f"buffer-recovery-{deployment}:{path_name}"
        if not timestamps:
            missing_initial.append(name)
            continue
        if policy == "initial":
            continue
        if policy == "drop" and len(timestamps) != 1:
            unexpected_retry.append(f"{name}={len(timestamps)} attempts")
            continue
        if policy == "drop":
            continue
        if len(timestamps) < 2:
            missing_retry.append(name)
            continue
        median = statistics.median(
            right - left for left, right in zip(timestamps, timestamps[1:])
        )
        if not 0.5 <= median <= 2.5:
            bad_cadence.append(f"{name}={median:.2f}s")

if missing_initial or missing_retry or unexpected_retry or bad_cadence:
    print(
        f"Non-uniform {policy} policy state: "
        f"missing initial={missing_initial}; "
        f"missing retry={missing_retry}; "
        f"unexpected retry={unexpected_retry}; "
        f"bad cadence={bad_cadence}",
        file=sys.stderr,
    )
    raise SystemExit(1)
print(f"verified {policy} policy for {deployment_count} deployments across metrics and logs")
PY
}

wait_for_uniform_policy() {
    local journal="$1"
    local policy="$2"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))

    while (( SECONDS < deadline )); do
        if assert_uniform_policy "$journal" "$policy" >/dev/null 2>&1; then
            assert_uniform_policy "$journal" "$policy"
            return 0
        fi
        sleep 0.25
    done
    assert_uniform_policy "$journal" "$policy"
}

recover_phase() {
    local phase="$1"
    local label="$2"
    start_receiver "$phase" "$label"
    wait_for_outputs "$temp_dir/state-$label" "$phase"
    sleep 2
    docker compose -p "$project_name" -f "$compose_file" stop receiver >/dev/null
}

test_status_policy() {
    local phase="$1"
    local status="$2"
    local warning_pattern="${3:-}"
    local policy="$4"
    local failure_label="$phase-$policy"

    start_receiver "$phase" "$failure_label" "$status"
    local warning_baseline=0
    if [[ -n "$warning_pattern" ]]; then
        warning_baseline="$(agent_log_count "$warning_pattern" "$temp_dir/$failure_label-agent-before.log")"
    fi
    trigger_phase "$phase"
    wait_for_uniform_policy "$temp_dir/state-$failure_label/requests.ndjson" initial

    if [[ "$policy" == "retry" && -n "$warning_pattern" ]]; then
        assert_warning_suppressed "$failure_label-http-$status" "$warning_pattern" "$warning_baseline"
    fi

    if [[ "$policy" == "drop" ]]; then
        assert_uniform_policy "$temp_dir/state-$failure_label/requests.ndjson" drop
        docker compose -p "$project_name" -f "$compose_file" stop receiver >/dev/null
    else
        wait_for_uniform_policy "$temp_dir/state-$failure_label/requests.ndjson" retry
        recover_phase "$phase" "$phase-recovery"
    fi
}

start_receiver online online
start_agent
wait_for_deployments
wait_for_deployment_activation
trigger_phase online
wait_for_outputs "$temp_dir/state-online" online
sleep 2
docker compose -p "$project_name" -f "$compose_file" stop receiver >/dev/null

# Connection refusal: warnings are emitted once per continuous outage and the
# payload remains available for recovery.
connection_warning='Connection Failure while trying to send data'
connection_warning_baseline="$(agent_log_count "$connection_warning" "$temp_dir/connection-agent-before.log")"
trigger_phase connection
assert_warning_suppressed connection "$connection_warning" "$connection_warning_baseline"
recover_phase connection connection-recovery

# 400-498 responses are terminal: every sender drops its payload.  The sender
# itself owns this path, so these statuses do not traverse the workflow-level
# warning handler.  Other non-2xx responses are retried and must recover.
test_status_policy status-400 400 '' drop
test_status_policy status-401 401 '' drop
test_status_policy status-404 404 '' drop
test_status_policy status-500 500 '' retry
test_status_policy status-302 302 '' retry

# A receiver that accepts requests but waits beyond the agent's 10-second HTTP
# timeout must leave the payload available for later delivery.
start_receiver timeout timeout-delay 200 15
trigger_phase timeout
sleep 12
docker compose -p "$project_name" -f "$compose_file" logs --no-color agent >"$temp_dir/timeout-agent.log" 2>&1
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
