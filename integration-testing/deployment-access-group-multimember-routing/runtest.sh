#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-opscotch-agent-java:dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-deployment-access-group.XXXXXX")"
agent_container="opscotch-deployment-access-group-$$"
receiver_pid=""
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$temp_dir/failure.txt" \
            "$temp_dir/complete.txt" \
            "$temp_dir/received-paths.json" \
            "$temp_dir/requests.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- receiver log tail ---\n' >&2
        [[ -f "$temp_dir/receiver.log" ]] && tail -200 "$temp_dir/receiver.log" >&2 || true
        printf '\n--- agent log tail ---\n' >&2
        docker logs "$agent_container" 2>&1 | tail -300 >&2 || true
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

mkdir -p "$temp_dir/state" "$temp_dir/persistence"
for deployment_id in caller remote-a remote-b; do
    mkdir -p \
        "$temp_dir/persistence/$deployment_id/metrics" \
        "$temp_dir/persistence/$deployment_id/logs"
done
read -r receiver_port caller_port remote_a_port remote_b_port < <(
    python3 "$SCENARIO_DIR/reserve_ports.py" 4
)

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-port "$receiver_port" \
    --caller-port "$caller_port" \
    --remote-a-port "$remote_a_port" \
    --remote-b-port "$remote_b_port" \
    --output-directory "$temp_dir"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$receiver_port" \
    --expected-paths "$temp_dir/expected-paths.json" \
    --state-directory "$temp_dir" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_completion() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$temp_dir/failure.txt" ]]; then
            cat "$temp_dir/failure.txt" >&2
            return 1
        fi
        if [[ -s "$temp_dir/complete.txt" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for the target bootstrap to emit its metric\n' >&2
    return 1
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker run --detach \
    --name "$agent_container" \
    --network host \
    --volume "$temp_dir:/config:ro" \
    --volume "$temp_dir/persistence:/persistence" \
    --env BOOTSTRAP_FILE=bootstrap.json \
    --env OPSCOTCH_OPTS=--accept-legal=yes \
    --env OPSCOTCH_LEGAL_ACCEPTED \
    "$AGENT_IMAGE" >/dev/null

wait_for_completion

if [[ -s "$temp_dir/failure.txt" ]]; then
    cat "$temp_dir/failure.txt" >&2
    exit 1
fi

python3 - "$temp_dir/received-paths.json" <<'PY'
import json
import pathlib
import sys

paths = json.loads(pathlib.Path(sys.argv[1]).read_text())
if paths != ["/metrics/remote-a"]:
    raise SystemExit(f"unexpected received paths: {paths}")
PY

printf 'Multi-member deployment access routed to the first matching target deployment\n'
