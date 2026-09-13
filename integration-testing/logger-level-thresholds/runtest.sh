#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-16-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-60}"
project_name="opscotch-logger-levels-$$"
compose_file="$SCENARIO_DIR/compose.yaml"

for command in docker python3; do
    command -v "$command" >/dev/null 2>&1 || {
        printf 'Required command not found: %s\n' "$command" >&2
        exit 2
    }
done
if [[ -z "${OPSCOTCH_LEGAL_ACCEPTED:-}" ]]; then
    printf 'OPSCOTCH_LEGAL_ACCEPTED must be set for Docker agent tests\n' >&2
    exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-logger-levels.XXXXXX")"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    local status=$?
    if (( status != 0 )); then
        printf '\n--- receiver state ---\n' >&2
        find "$state_dir" -maxdepth 1 -type f -print -exec cat {} \; >&2 2>/dev/null || true
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 300 >&2 || true
    fi
    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir"
for deployment in logger-levels-bootstrap-wins logger-levels-workflow-fallback logger-levels-control; do
    mkdir -p "$persistence_dir/$deployment/metrics" "$persistence_dir/$deployment/logs"
done
python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver --receiver-port 8080 --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED
printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans >/dev/null

wait_for_file() {
    local file="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        local agent_container
        agent_container="$(docker compose -p "$project_name" -f "$compose_file" ps --all -q agent)"
        if [[ -n "$agent_container" ]] \
            && [[ "$(docker inspect --format '{{.State.Status}}' "$agent_container")" == "exited" ]]; then
            printf 'Agent exited before producing %s\n' "$file" >&2
            return 1
        fi
        [[ -s "$state_dir/failure.txt" ]] && cat "$state_dir/failure.txt" >&2 && return 1
        [[ -s "$file" ]] && return 0
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$file" >&2
    return 1
}

wait_for_file "$state_dir/metrics-complete.txt"
wait_for_file "$state_dir/received-logs.ndjson"
sleep 2
docker compose -p "$project_name" -f "$compose_file" logs --no-color agent >"$temp_dir/agent.log" 2>&1

python3 - "$state_dir/received-metrics.json" "$state_dir/received-logs.ndjson" "$temp_dir/agent.log" <<'PY'
import json
import pathlib
import sys

metrics = set(json.loads(pathlib.Path(sys.argv[1]).read_text()))
remote = pathlib.Path(sys.argv[2]).read_text() if pathlib.Path(sys.argv[2]).exists() else ""
agent = pathlib.Path(sys.argv[3]).read_text()
expected_metrics = {
    "logger-levels-bootstrap-wins-complete",
    "logger-levels-workflow-fallback-complete",
    "logger-levels-control-complete",
}
if metrics != expected_metrics:
    raise SystemExit(f"runOnce metrics incomplete: {metrics}")

def require(text, source, name):
    if text not in source:
        raise SystemExit(f"Missing {name}: {text}")

def forbid(text, source, name):
    if text in source:
        raise SystemExit(f"Unexpected {name}: {text}")

# The control deployment demonstrates the unconfigured default in both local
# and remote observers.  The two configured deployments prove that levels are
# instance-scoped and resolved with bootstrap-over-workflow precedence.
for source, name in ((agent, "agent log"), (remote, "remote log")):
    require("logger-levels-control-diagnostic-info", source, name)
    require("logger-levels-control-runonce", source, name)
    forbid("logger-levels-bootstrap-wins-diagnostic-info", source, name)
    forbid("logger-levels-workflow-fallback-diagnostic-info", source, name)
    forbid("logger-levels-bootstrap-wins-runonce", source, name)
    forbid("logger-levels-workflow-fallback-runonce", source, name)

require("Opscotch Legal Terms Accepted", agent, "AlwaysLogLogger startup record")
PY

printf 'Verified runOnce logger-level thresholds, precedence, isolation, and remote filtering\n'
