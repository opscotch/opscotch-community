#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-deployment-access-group.XXXXXX")"
project_name="opscotch-deployment-access-group-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"
keep_failed="${KEEP_FAILED_INTEGRATION_TEST:-0}"

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/complete.txt" \
            "$state_dir/received-paths.json" \
            "$state_dir/requests.ndjson"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 >&2 || true
    fi

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    if (( status != 0 )) && [[ "$keep_failed" == "1" ]]; then
        printf '\nRetained scenario directory: %s\n' "$temp_dir" >&2
    else
        rm -rf "$temp_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
for deployment_id in caller remote-a remote-b; do
    mkdir -p \
        "$persistence_dir/$deployment_id/metrics" \
        "$persistence_dir/$deployment_id/logs"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --caller-port 8081 \
    --remote-a-port 8082 \
    --remote-b-port 8083 \
    --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED

wait_for_completion() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        if [[ -s "$state_dir/complete.txt" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for the target bootstrap to emit its metric\n' >&2
    return 1
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans >/dev/null
wait_for_completion

python3 - "$state_dir/received-paths.json" <<'PY'
import json
import pathlib
import sys

paths = json.loads(pathlib.Path(sys.argv[1]).read_text())
if paths != ["/metrics/remote-a"]:
    raise SystemExit(f"unexpected received paths: {paths}")
PY

printf 'Multi-member deployment access routed to the first matching target deployment\n'
