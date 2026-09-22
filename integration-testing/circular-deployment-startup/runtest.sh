#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-20-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-45}"

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-circular-startup.XXXXXX")"
project_name="opscotch-circular-startup-$$"
fixture_dir="$temp_dir/fixtures"
compose_file="$SCENARIO_DIR/compose.yaml"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- agent log ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 200 agent >&2 || true
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir"
python3 "$SCENARIO_DIR/generate_fixtures.py" --output-directory "$fixture_dir"
FIXTURE_DIR="$fixture_dir"
export AGENT_IMAGE FIXTURE_DIR OPSCOTCH_LEGAL_ACCEPTED

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans agent >/dev/null

deadline=$((SECONDS + TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
    logs="$(docker compose -p "$project_name" -f "$compose_file" logs --no-color agent 2>/dev/null || true)"
    if grep -q 'Startup activation complete for deploymentId: alpha, activated=true' <<<"$logs" \
        && grep -q 'Startup activation complete for deploymentId: beta, activated=true' <<<"$logs"; then
        printf 'Circular deployment startup activated alpha and beta\n'
        exit 0
    fi
    if grep -q 'Dependency deployment did not activate in time' <<<"$logs"; then
        printf 'Circular deployment startup timed out waiting on a dependency\n' >&2
        exit 1
    fi
    if [[ "$(docker compose -p "$project_name" -f "$compose_file" ps -aq agent)" ]] \
        && ! docker compose -p "$project_name" -f "$compose_file" ps --status running -q agent | grep -q .; then
        printf 'Agent exited before both circular deployments activated\n' >&2
        exit 1
    fi
    sleep 0.25
done

printf 'Timed out waiting for both circular deployments to activate\n' >&2
exit 1
