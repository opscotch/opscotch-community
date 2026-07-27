#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-10}"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-external-secrets-source-loading.XXXXXX")"
agent_container=""
receiver_pid=""

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$temp_dir/state/failure.txt" \
            "$temp_dir/state/complete.txt" \
            "$temp_dir/state/received-paths.json"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- receiver log tail ---\n' >&2
        if [[ -f "$temp_dir/receiver.log" ]]; then
            tail -200 "$temp_dir/receiver.log" >&2 || true
        fi
        printf '\n--- agent log tail ---\n' >&2
        if [[ -n "$agent_container" ]]; then
            docker logs "$agent_container" 2>&1 | tail -200 >&2 || true
        fi
    fi

    if [[ -n "$agent_container" ]]; then
        docker rm -f "$agent_container" >/dev/null 2>&1 || true
    fi
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

read -r receiver_port < <(python3 "$SCENARIO_DIR/reserve_port.py")

mkdir -p "$temp_dir/fixtures" "$temp_dir/persistence" "$temp_dir/state"
for deployment_id in \
    external-secrets-file \
    external-secrets-url \
    external-secrets-hostrecord \
    external-secrets-combined
do
    mkdir -p "$temp_dir/persistence/$deployment_id/metrics"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$receiver_port" \
    --output-directory "$temp_dir/fixtures"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$receiver_port" \
    --fixtures-directory "$temp_dir/fixtures" \
    --state-directory "$temp_dir/state" \
    --expected-paths "$temp_dir/fixtures/expected-paths.json" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_receiver() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if curl --silent --fail --max-time 1 "http://127.0.0.1:$receiver_port/health" >/dev/null 2>&1; then
            return 0
        fi
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for receiver health on port %s\n' "$receiver_port" >&2
    return 1
}

wait_for_path() {
    local expected_path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/state/failure.txt" ]]; then
            cat "$temp_dir/state/failure.txt" >&2
            return 1
        fi
        if python3 - "$temp_dir/state/received-paths.json" "$expected_path" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
expected = sys.argv[2]
if not path.exists():
    raise SystemExit(1)
received = json.loads(path.read_text())
raise SystemExit(0 if expected in received else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$expected_path" >&2
    if [[ -f "$temp_dir/state/received-paths.json" ]]; then
        cat "$temp_dir/state/received-paths.json" >&2
    fi
    return 1
}

assert_exact_paths() {
    python3 - "$temp_dir/state/received-paths.json" "$temp_dir/fixtures/expected-paths.json" <<'PY'
import json
import pathlib
import sys

received_path = pathlib.Path(sys.argv[1])
expected_path = pathlib.Path(sys.argv[2])
received = json.loads(received_path.read_text()) if received_path.exists() else []
expected = json.loads(expected_path.read_text())
if sorted(received) != sorted(expected):
    print(f"expected paths: {sorted(expected)}")
    print(f"actual paths:   {sorted(received)}")
    raise SystemExit(1)
PY
}

run_phase() {
    local phase_name="$1"
    local bootstrap_file="$2"
    local source_spec_file="$3"
    local expected_path="$4"

    agent_container="external-secrets-source-loading-${phase_name}-$$"
    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    docker run --detach \
        --name "$agent_container" \
        --network host \
        --volume "$temp_dir/fixtures:/config:ro" \
        --volume "$temp_dir/fixtures:/fixtures:ro" \
        --volume "$temp_dir/persistence:/persistence" \
        --env BOOTSTRAP_FILE="$bootstrap_file" \
        --env OPSCOTCH_LEGAL_ACCEPTED \
        --env OPSCOTCH_OPTS=--accept-legal=yes \
        --env OPSCOTCH_SECRETS_FROM="$(<"$temp_dir/fixtures/$source_spec_file")" \
        "$AGENT_IMAGE" >/dev/null

    wait_for_path "$expected_path"
    docker logs "$agent_container" >"$temp_dir/agent-${phase_name}.log" 2>&1 || true
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    agent_container=""
}

wait_for_receiver

run_phase "file" "bootstrap-file.json" "file-source.txt" "/metrics/file"
run_phase "url" "bootstrap-url.json" "url-source.txt" "/metrics/url"
run_phase "hostrecord" "bootstrap-hostrecord.json" "hostrecord-source.txt" "/metrics/hostrecord"
run_phase "combined" "bootstrap-combined.json" "combined-source.txt" "/metrics/file/url/hostrecord"

assert_exact_paths

printf 'Verified file, URL, hostrecord, and combined external secret sources\n'
