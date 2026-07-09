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
fixture_dir="$ARTIFACT_DIR/fixtures"
test_result_file="$temp_dir/state/test-result.txt"

copy_if_present() {
    local source="$1"
    local destination="$2"

    if [[ -f "$source" ]]; then
        cp -f "$source" "$destination"
    fi
}

copy_state_artifacts() {
    mkdir -p "$ARTIFACT_DIR"
    for file in \
        "$temp_dir/state/failure.txt" \
        "$temp_dir/state/complete.txt" \
        "$test_result_file" \
        "$temp_dir/state/received-metrics.json" \
        "$temp_dir/state/received-logs.json" \
        "$temp_dir/state/received-events.ndjson"
    do
        copy_if_present "$file" "$ARTIFACT_DIR/$(basename "$file")"
    done
}

preserve_run_artifacts() {
    mkdir -p "$ARTIFACT_DIR"

    copy_state_artifacts
    copy_if_present "$temp_dir/receiver.log" "$ARTIFACT_DIR/receiver.log"
    copy_if_present "$temp_dir/agent.log" "$ARTIFACT_DIR/agent.log"
    if [[ -n "$agent_container" ]]; then
        docker logs "$agent_container" >"$ARTIFACT_DIR/agent.log" 2>&1 || true
    fi
}

cleanup() {
    status=$?

    preserve_run_artifacts

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

mkdir -p "$ARTIFACT_DIR" "$fixture_dir" "$temp_dir/state"
port="$(python3 "$SCENARIO_DIR/reserve_port.py")"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$port" \
    --output-directory "$fixture_dir"

mkdir -p "$temp_dir/persistence"
for deployment_id in bootstrap-priority-01 bootstrap-priority-05 bootstrap-priority-10; do
    mkdir -p \
        "$temp_dir/persistence/$deployment_id/metrics" \
        "$temp_dir/persistence/$deployment_id/logs"
done

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$port" \
    --state-directory "$temp_dir/state" \
    --expected-metrics "$fixture_dir/expected-metrics.json" \
    --expected-logs "$fixture_dir/expected-logs.json" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_health() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            return 0
        fi
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >"$test_result_file"
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for receiver health on port %s\n' "$port" >&2
    printf 'Timed out waiting for receiver health on port %s\n' "$port" >"$test_result_file"
    return 1
}

wait_for_completion() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            cat "$temp_dir/state/failure.txt" >"$test_result_file"
            return 1
        fi
        if [[ -s "$temp_dir/state/complete.txt" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for ordered logs and metrics to complete\n' >&2
    printf 'Timed out waiting for ordered logs and metrics to complete\n' >"$test_result_file"
    return 1
}

assert_phase_order() {
    local actual="$1"
    local expected="$2"
    local label="$3"
    local output
    if output="$(python3 - "$actual" "$expected" "$label" <<'PY'
import json
import pathlib
from collections import Counter
import sys

actual_path = pathlib.Path(sys.argv[1])
expected_path = pathlib.Path(sys.argv[2])
label = sys.argv[3]
actual = json.loads(actual_path.read_text()) if actual_path.exists() else []
expected = json.loads(expected_path.read_text()) if expected_path.exists() else []
expected_runonce = [token for token in expected if token.endswith("-runonce")]
expected_timers = [token for token in expected if token.endswith("-timer")]

first_timer_index = next(
    (index for index, token in enumerate(actual) if token.endswith("-timer")),
    len(actual),
)
actual_runonce = actual[:first_timer_index]
actual_timers = actual[first_timer_index:]

if any(token.endswith("-runonce") for token in actual_timers):
    print(
        f"{label} phase mismatch\n"
        f"expected runOnce before timers\n"
        f"actual:   {actual}"
    )
    raise SystemExit(1)

if Counter(actual_runonce) != Counter(expected_runonce) or Counter(actual_timers) != Counter(expected_timers):
    print(
        f"{label} phase mismatch\n"
        f"expected runOnce: {expected_runonce}\n"
        f"actual runOnce:   {actual_runonce}\n"
        f"expected timers:  {expected_timers}\n"
        f"actual timers:    {actual_timers}"
    )
    raise SystemExit(1)
PY
    )"; then
        return 0
    fi
    printf '%s\n' "$output" >"$test_result_file"
    return 1
}

assert_startup_order() {
    local agent_log="$1"
    local output
    if output="$(python3 - "$agent_log" "$fixture_dir/expected-startup-order.json" <<'PY'
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
    print(f"startup order mismatch\nexpected: {expected}\nactual:   {actual}")
    raise SystemExit(1)
PY
    )"; then
        return 0
    fi
    printf '%s\n' "$output" >"$test_result_file"
    return 1
}

wait_for_health

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker run --detach \
    --name "$agent_container" \
    --network host \
    --volume "$fixture_dir:/fixtures:ro" \
    --volume "$temp_dir/persistence:/persistence" \
    --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
    --env OPSCOTCH_LEGAL_ACCEPTED \
    "$AGENT_IMAGE" >/dev/null

wait_for_completion

docker logs "$agent_container" >"$temp_dir/agent.log" 2>&1
assert_phase_order "$temp_dir/state/received-metrics.json" "$fixture_dir/expected-metrics.json" "metric"
assert_phase_order "$temp_dir/state/received-logs.json" "$fixture_dir/expected-logs.json" "log"
assert_startup_order "$temp_dir/agent.log"

printf 'passed\n' >"$test_result_file"
preserve_run_artifacts

printf 'Verified startupPriority ordering and runOnce-before-zero-delay-timer output for 3 bootstraps\n'
