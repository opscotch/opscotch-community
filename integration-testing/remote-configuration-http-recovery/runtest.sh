#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-remote-config-http-recovery.XXXXXX")"
project_name="opscotch-remote-config-http-recovery-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/requests.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
    fi

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true

    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf 'Retained scenario directory: %s\n' "$temp_dir" >&2
        return 0
    fi

    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
mkdir -p \
    "$persistence_dir/remote-configuration-http-recovery/metrics" \
    "$persistence_dir/remote-configuration-http-recovery/logs"

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --server-port 8080 \
    --server-host receiver \
    --agent-port 8081 \
    --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_receiver_health() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker compose -p "$project_name" -f "$compose_file" exec -T receiver python3 - <<'PY'
import urllib.request

with urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=1) as response:
    response.read()
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for receiver health\n' >&2
    return 1
}

wait_for_request_count() {
    local expected_count="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if python3 - "$state_dir/requests.ndjson" "$expected_count" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
expected_count = int(sys.argv[2])
if not path.exists():
    raise SystemExit(1)
requests = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
workflow_requests = [entry for entry in requests if entry["path"] == "/workflow.json"]
raise SystemExit(0 if len(workflow_requests) >= expected_count else 1)
PY
        then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for at least %s workflow request(s)\n' "$expected_count" >&2
    return 1
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans receiver >/dev/null
wait_for_receiver_health
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans agent >/dev/null
wait_for_request_count 2

python3 - "$temp_dir/state/requests.ndjson" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
requests = [
    json.loads(line)
    for line in path.read_text().splitlines()
    if line.strip()
]
workflow = [entry for entry in requests if entry["path"] == "/workflow.json"]
if len(workflow) < 2:
    raise SystemExit(f"Expected at least two workflow requests, got {len(workflow)}")
delta = workflow[1]["timestamp"] - workflow[0]["timestamp"]
if not 0.5 <= delta <= 2.5:
    raise SystemExit(f"Unexpected retry interval: {delta:.3f}s")
if any(entry["status"] != 404 for entry in workflow[:2]):
    raise SystemExit(f"Unexpected status sequence: {[entry['status'] for entry in workflow[:2]]}")
PY

if [[ -s "$temp_dir/failure.txt" ]]; then
    cat "$temp_dir/failure.txt" >&2
    exit 1
fi

printf 'The agent retried the 404 configuration fetch about one second later\n'
