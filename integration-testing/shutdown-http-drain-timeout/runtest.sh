#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-120}"
AGENT_CPUS="${OPSCOTCH_AGENT_CPUS:-1}"
AGENT_MEMORY="${OPSCOTCH_AGENT_MEMORY:-512m}"
AGENT_PIDS_LIMIT="${OPSCOTCH_AGENT_PIDS_LIMIT:-512}"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-shutdown-http-drain-timeout.XXXXXX")"
project_name="opscotch-shutdown-http-drain-timeout-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
artifact_root="${INTEGRATION_TEST_ARTIFACT_DIR:-$SCENARIO_DIR/artifacts}"
artifact_dir="$artifact_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"

export SCENARIO_DIR AGENT_IMAGE AGENT_CPUS AGENT_MEMORY AGENT_PIDS_LIMIT

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
        for file in \
            "$temp_dir/phase-1/state/state.json" \
            "$temp_dir/phase-2/state/state.json" \
            "$temp_dir/phase-1/state/failure.txt" \
            "$temp_dir/phase-2/state/failure.txt"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$artifact_dir" "$temp_dir"

wait_for_file() {
    local path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$path" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$path" >&2
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
    cat "$state_file" >&2
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

run_phase() {
    local phase_name="$1"
    local shutdown_timeout_seconds="$2"
    local stop_limit_seconds="$3"
    local expect_timeout_warning="$4"
    local expected_completed="$5"
    local expected_canceled="$6"
    local phase_dir="$temp_dir/$phase_name"
    local phase_fixtures="$phase_dir/fixtures"
    local phase_state="$phase_dir/state"
    local phase_persistence="$phase_dir/persistence"
    local phase_log="$phase_dir/agent.log"
    local deployment_id="shutdown-http-drain-timeout-$phase_name"

    mkdir -p \
        "$phase_fixtures" \
        "$phase_state" \
        "$phase_persistence/$deployment_id"

    python3 "$SCENARIO_DIR/generate_fixtures.py" \
        --phase-name "$phase_name" \
        --receiver-host receiver \
        --receiver-port 8080 \
        --shutdown-timeout-seconds "$shutdown_timeout_seconds" \
        --output-directory "$phase_fixtures"

    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    export FIXTURE_DIR="$phase_fixtures" STATE_DIR="$phase_state" PERSISTENCE_DIR="$phase_persistence" \
        AGENT_CPUS="$AGENT_CPUS" AGENT_MEMORY="$AGENT_MEMORY" AGENT_PIDS_LIMIT="$AGENT_PIDS_LIMIT"
    docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --force-recreate receiver agent >/dev/null

    wait_for_active_request "$phase_state/state.json"

    local agent_container
    agent_container="$(docker compose -p "$project_name" -f "$compose_file" ps -q agent)"
    local stop_started=$SECONDS
    docker compose -p "$project_name" -f "$compose_file" stop -t "$stop_limit_seconds" agent >/dev/null
    local stop_elapsed=$((SECONDS - stop_started))

    docker compose -p "$project_name" -f "$compose_file" logs --no-color agent >"$phase_log" 2>&1
    local agent_exit_code
    agent_exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$agent_container")"
    case "$agent_exit_code" in
        0|143) ;;
        *)
            printf 'Phase %s: agent exited with code %s\n' "$phase_name" "$agent_exit_code" >&2
            return 1
            ;;
    esac

    cp "$phase_log" "$artifact_dir/agent-$phase_name.log"
    cp "$phase_state/state.json" "$artifact_dir/state-$phase_name.json"
    cp "$phase_fixtures/bootstrap.json" "$artifact_dir/bootstrap-$phase_name.json"
    cp "$phase_fixtures/workflow.json" "$artifact_dir/workflow-$phase_name.json"
    cp "$phase_fixtures/metadata.json" "$artifact_dir/metadata-$phase_name.json"

    if [[ "$expect_timeout_warning" == "yes" ]]; then
        wait_for_shutdown_warning "$phase_log"
    else
        if grep -q 'HTTP calls will be cancelled after the shutdown grace period.' "$phase_log"; then
            printf 'Phase %s: unexpected shutdown timeout warning\n' "$phase_name" >&2
            return 1
        fi
    fi

    if ! wait_for_state "$phase_state/state.json" "$expected_completed" "$expected_canceled"; then
        printf 'Phase %s: unexpected request state\n' "$phase_name" >&2
        cat "$phase_state/state.json" >&2
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

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null
    printf 'Phase %s passed: shutdown=%ss completed=%s canceled=%s\n' \
        "$phase_name" "$stop_elapsed" "$expected_completed" "$expected_canceled"
}

run_phase "phase-1" 25 35 "no" 1 0
run_phase "phase-2" 1 10 "yes" 1 0

printf 'Verified shutdown-drain timeout behavior across 2 phases\n'
