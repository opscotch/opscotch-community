#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-120}"
ARTIFACT_ROOT="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
ARTIFACT_DIR="$ARTIFACT_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$$"
AGENT_CPUS="${OPSCOTCH_AGENT_CPUS:-1}"
AGENT_MEMORY="${OPSCOTCH_AGENT_MEMORY:-512m}"
AGENT_PIDS_LIMIT="${OPSCOTCH_AGENT_PIDS_LIMIT:-512}"
BLOCK_SECONDS=20
PHASE1_SHUTDOWN_TIMEOUT_SECONDS=25
PHASE1_STOP_LIMIT_SECONDS=35
PHASE2_SHUTDOWN_TIMEOUT_SECONDS=1
PHASE2_STOP_LIMIT_SECONDS=10

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-shutdown-http-drain-timeout.XXXXXX")"
agent_container=""
server_pid=""
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

copy_if_present() {
    local source="$1"
    local destination="$2"

    if [[ -f "$source" ]]; then
        cp -f "$source" "$destination"
    fi
}

state_matches_expected() {
    local state_file="$1"
    local expected_completed="$2"
    local expected_canceled="$3"

    python3 - "$state_file" "$expected_completed" "$expected_canceled" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
expected_completed = int(sys.argv[2])
expected_canceled = int(sys.argv[3])

if not path.exists():
    raise SystemExit(1)

state = json.loads(path.read_text())
if state.get("activeRequests") != 0:
    raise SystemExit(1)
if state.get("completedRequests") != expected_completed:
    raise SystemExit(1)
if state.get("canceledRequests") != expected_canceled:
    raise SystemExit(1)
if state.get("lastPath") != "/block/20":
    raise SystemExit(1)
if state.get("maximumActiveRequests", 0) < 1:
    raise SystemExit(1)
PY
}

wait_for_health() {
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

wait_for_active_request() {
    local state_file="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if python3 - "$state_file" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
state = json.loads(path.read_text())
raise SystemExit(0 if state.get("activeRequests", 0) > 0 else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for the blocking HTTP request to become active\n' >&2
    return 1
}

wait_for_state() {
    local state_file="$1"
    local expected_completed="$2"
    local expected_canceled="$3"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if state_matches_expected "$state_file" "$expected_completed" "$expected_canceled"; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for request state: completed=%s canceled=%s\n' \
        "$expected_completed" "$expected_canceled" >&2
    if [[ -f "$state_file" ]]; then
        cat "$state_file" >&2
    fi
    return 1
}

wait_for_shutdown_warning() {
    local log_file="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if grep -q 'HTTP calls will be cancelled after the shutdown grace period.' "$log_file"; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for the shutdown timeout warning in %s\n' "$log_file" >&2
    return 1
}

reset_server() {
    curl --silent --show-error --fail --request POST "http://127.0.0.1:$1/reset" >/dev/null
}

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- server state ---\n' >&2
        for file in \
            "$temp_dir/state/phase-1.json" \
            "$temp_dir/state/phase-2.json" \
            "$temp_dir/state/state.json"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- server log tail ---\n' >&2
        if [[ -f "$temp_dir/server.log" ]]; then
            tail -200 "$temp_dir/server.log" >&2 || true
        fi
        printf '\n--- agent log tail ---\n' >&2
        if [[ -f "$temp_dir/agent-phase-1.log" ]]; then
            tail -200 "$temp_dir/agent-phase-1.log" >&2 || true
        fi
        if [[ -f "$temp_dir/agent-phase-2.log" ]]; then
            tail -200 "$temp_dir/agent-phase-2.log" >&2 || true
        fi
        if [[ -n "$agent_container" ]]; then
            printf '\n--- live container log tail ---\n' >&2
            docker logs "$agent_container" 2>&1 | tail -200 >&2 || true
        fi
    fi

    if [[ -n "$agent_container" ]]; then
        docker rm -f "$agent_container" >/dev/null 2>&1 || true
    fi
    if [[ -n "$server_pid" ]]; then
        kill "$server_pid" >/dev/null 2>&1 || true
        wait "$server_pid" >/dev/null 2>&1 || true
    fi

    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$ARTIFACT_DIR" "$temp_dir/state" "$temp_dir/persistence"

port="$(python3 "$SCENARIO_DIR/reserve_port.py")"
python3 "$SCENARIO_DIR/scenario_server.py" \
    --port "$port" \
    --state-directory "$temp_dir/state" \
    --block-seconds "$BLOCK_SECONDS" \
    >"$temp_dir/server.log" 2>&1 &
server_pid=$!

wait_for_health "http://127.0.0.1:$port/health"

run_phase() {
    local phase_name="$1"
    local shutdown_timeout_seconds="$2"
    local stop_limit_seconds="$3"
    local expect_timeout_warning="$4"
    local expected_completed="$5"
    local expected_canceled="$6"
    local phase_fixtures="$temp_dir/fixtures-$phase_name"
    local phase_persistence="$temp_dir/persistence-$phase_name"
    local phase_log="$temp_dir/agent-$phase_name.log"
    local phase_state_copy="$temp_dir/state/$phase_name.json"
    local deployment_id="shutdown-http-drain-timeout-$phase_name"

    mkdir -p "$phase_fixtures" "$phase_persistence/$deployment_id"
    python3 "$SCENARIO_DIR/generate_fixtures.py" \
        --phase-name "$phase_name" \
        --receiver-port "$port" \
        --shutdown-timeout-seconds "$shutdown_timeout_seconds" \
        --output-directory "$phase_fixtures"

    reset_server "$port"

    agent_container="opscotch-shutdown-http-drain-timeout-${phase_name}-$$"
    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    docker run --detach \
        --name "$agent_container" \
        --network host \
        --cpus "$AGENT_CPUS" \
        --memory "$AGENT_MEMORY" \
        --memory-swap "$AGENT_MEMORY" \
        --pids-limit "$AGENT_PIDS_LIMIT" \
        --volume "$phase_fixtures:/fixtures:ro" \
        --volume "$phase_persistence:/persistence" \
        --env BOOTSTRAP_FILE=/fixtures/bootstrap.json \
        --env OPSCOTCH_LEGAL_ACCEPTED \
        "$AGENT_IMAGE" \
        --accept-legal=yes >/dev/null

    wait_for_active_request "$temp_dir/state/state.json"

    local stop_started=$SECONDS
    docker stop --time "$stop_limit_seconds" "$agent_container" >/dev/null
    local stop_elapsed=$((SECONDS - stop_started))

    docker logs "$agent_container" >"$phase_log" 2>&1
    agent_exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$agent_container")"
    if [[ "$agent_exit_code" != "0" ]]; then
        printf 'Phase %s: agent exited with code %s\n' "$phase_name" "$agent_exit_code" >&2
        return 1
    fi
    cp "$phase_log" "$ARTIFACT_DIR/agent-$phase_name.log"
    cp "$temp_dir/state/state.json" "$phase_state_copy"
    cp "$phase_state_copy" "$ARTIFACT_DIR/state-$phase_name.json"
    copy_if_present "$phase_fixtures/bootstrap.json" "$ARTIFACT_DIR/bootstrap-$phase_name.json"
    copy_if_present "$phase_fixtures/workflow.json" "$ARTIFACT_DIR/workflow-$phase_name.json"
    copy_if_present "$phase_fixtures/metadata.json" "$ARTIFACT_DIR/metadata-$phase_name.json"

    if [[ "$expect_timeout_warning" == "yes" ]]; then
        wait_for_shutdown_warning "$phase_log"
        if ! grep -q 'HTTP calls will be cancelled after the shutdown grace period.' "$phase_log"; then
            printf 'Phase %s: missing shutdown timeout warning\n' "$phase_name" >&2
            return 1
        fi
    else
        if grep -q 'HTTP calls will be cancelled after the shutdown grace period.' "$phase_log"; then
            printf 'Phase %s: unexpected shutdown timeout warning\n' "$phase_name" >&2
            return 1
        fi
    fi

    if ! state_matches_expected "$temp_dir/state/state.json" "$expected_completed" "$expected_canceled"; then
        printf 'Phase %s: unexpected request state\n' "$phase_name" >&2
        cat "$temp_dir/state/state.json" >&2
        return 1
    fi

    if [[ "$phase_name" == "phase-1" ]]; then
        if (( stop_elapsed < 15 )); then
            printf 'Phase %s: shutdown completed too quickly (%ss)\n' "$phase_name" "$stop_elapsed" >&2
            return 1
        fi
    else
        if (( stop_elapsed > 8 )); then
            printf 'Phase %s: shutdown took too long (%ss)\n' "$phase_name" "$stop_elapsed" >&2
            return 1
        fi
    fi

    docker rm "$agent_container" >/dev/null
    agent_container=""

    printf 'Phase %s passed: shutdown=%ss completed=%s canceled=%s\n' \
        "$phase_name" "$stop_elapsed" "$expected_completed" "$expected_canceled"
}

run_phase "phase-1" "$PHASE1_SHUTDOWN_TIMEOUT_SECONDS" "$PHASE1_STOP_LIMIT_SECONDS" "no" 1 0
run_phase "phase-2" "$PHASE2_SHUTDOWN_TIMEOUT_SECONDS" "$PHASE2_STOP_LIMIT_SECONDS" "yes" 0 1

copy_if_present "$temp_dir/server.log" "$ARTIFACT_DIR/server.log"

printf 'Verified shutdown-drain timeout behavior across 2 phases\n'
