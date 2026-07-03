#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-45}"
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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-startup-priority.XXXXXX")"
agent_container="opscotch-startup-priority-$$"
receiver_pid=""
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

cleanup() {
    status=$?

    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$temp_dir/state/failure.txt" \
            "$temp_dir/state/complete.txt" \
            "$temp_dir/state/received-metrics.json" \
            "$temp_dir/state/received-logs.json" \
            "$temp_dir/state/received-events.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- agent log tail ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -200 >&2 || true
    fi

    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" >/dev/null 2>&1 || true
        wait "$receiver_pid" >/dev/null 2>&1 || true
    fi

    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
        return 0
    fi

    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$ARTIFACT_DIR" "$temp_dir/state"
port="$(python3 "$SCENARIO_DIR/reserve_port.py")"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$port" \
    --output-directory "$temp_dir"

mkdir -p "$temp_dir/persistence"
for deployment_id in bootstrap-priority-01 bootstrap-priority-05 bootstrap-priority-10; do
    mkdir -p \
        "$temp_dir/persistence/$deployment_id/metrics" \
        "$temp_dir/persistence/$deployment_id/logs"
done

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$port" \
    --state-directory "$temp_dir/state" \
    --expected-metrics "$temp_dir/expected-metrics.json" \
    --expected-logs "$temp_dir/expected-logs.json" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_health() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            return 0
        fi
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for receiver health on port %s\n' "$port" >&2
    return 1
}

wait_for_completion() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        fi
        if [[ -s "$temp_dir/state/complete.txt" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for ordered logs and metrics to complete\n' >&2
    return 1
}

assert_sequence() {
    local actual="$1"
    local expected="$2"
    local label="$3"
    python3 - "$actual" "$expected" "$label" <<'PY'
import json
import pathlib
import sys

actual_path = pathlib.Path(sys.argv[1])
expected_path = pathlib.Path(sys.argv[2])
label = sys.argv[3]
actual = json.loads(actual_path.read_text()) if actual_path.exists() else []
expected = json.loads(expected_path.read_text()) if expected_path.exists() else []
if actual != expected:
    raise SystemExit(
        f"{label} order mismatch\nexpected: {expected}\nactual:   {actual}"
    )
PY
}

assert_startup_order() {
    local agent_log="$1"
    python3 - "$agent_log" "$temp_dir/expected-startup-order.json" <<'PY'
import json
import pathlib
import re
import sys

log_path = pathlib.Path(sys.argv[1])
expected = json.loads(pathlib.Path(sys.argv[2]).read_text())
pattern = re.compile(
    r"Startup (?:final )?activation complete for deploymentId: (?P<deployment_id>bootstrap-priority-\d+), activated=true"
)
actual = []
for line in log_path.read_text(errors="replace").splitlines():
    match = pattern.search(line)
    if match:
        actual.append(match.group("deployment_id"))
if actual != expected:
    raise SystemExit(f"startup order mismatch\nexpected: {expected}\nactual:   {actual}")
PY
}

wait_for_health

docker run --detach \
    --name "$agent_container" \
    --network host \
    --volume "$temp_dir:/fixtures:ro" \
    --volume "$temp_dir/persistence:/persistence" \
    --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
    --env OPSCOTCH_LEGAL_ACCEPTED \
    "$AGENT_IMAGE" >/dev/null

wait_for_completion

docker logs "$agent_container" >"$temp_dir/agent.log" 2>&1
assert_sequence "$temp_dir/state/received-metrics.json" "$temp_dir/expected-metrics.json" "metric"
assert_sequence "$temp_dir/state/received-logs.json" "$temp_dir/expected-logs.json" "log"
assert_startup_order "$temp_dir/agent.log"

cp "$temp_dir/agent.log" "$ARTIFACT_DIR/agent.log"
cp "$temp_dir/state/received-metrics.json" "$ARTIFACT_DIR/received-metrics.json"
cp "$temp_dir/state/received-logs.json" "$ARTIFACT_DIR/received-logs.json"
cp "$temp_dir/state/received-events.ndjson" "$ARTIFACT_DIR/received-events.ndjson"
cp "$temp_dir/state/complete.txt" "$ARTIFACT_DIR/complete.txt"

printf 'Verified startupPriority ordering and runOnce-before-zero-delay-timer output for 3 bootstraps\n'
