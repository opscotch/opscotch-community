#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-45}"

STRING_SECRET_KEYS="D94445ACC6379E16CB12878C8524F7C2A6226BB4FDA8CA4357F40251C67FBA6B/C87321EB00BE4E3C6B8890CB68F61BD40CCBB013BD3D62878F50810885988EE3"
ENCRYPTED_AUTHORIZATION="-2/AQABGGfiU9bPgJ9RPhiIAQG86+VUlD4RaV5qbwFGpy6inX2y0OqU0uP3MTO8KtZ/jsAH8zCEa4OYZSAwuqkIyxFOK/tUJOekGadQoHvSzLLe9qf7hCdcWJVRrBhGwq/coVhERQF0txP2+pfq73bOFUKofZ5UAjyTuOMbA5HMrSGFDH1iFN8jJbX8vI7fPlGXrl/sQRQ1TQgnVyTkmBXNFAIhi13sDt1ULIc0Gub4Hdvfqpj0r8oeNMXANJaRFOQuGZ9wM3jzwqPRgGonDaVWKIUt5eV+GqA5oVI="
DECRYPTED_AUTHORIZATION="Basic cGhtX21vbml0b3Jpbmc6azV5OHJHc0JDNzBvTXU2REJkQQ=="

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-encrypted-output-auth.XXXXXX")"
project_name="opscotch-encrypted-output-auth-$$"
compose_file="$SCENARIO_DIR/compose.yaml"
fixture_dir="$temp_dir/fixtures"
state_dir="$temp_dir/state"
persistence_dir="$temp_dir/persistence"

cleanup() {
    local status=$?

    if (( status != 0 )); then
        printf '\n--- compose logs ---\n' >&2
        docker compose -p "$project_name" -f "$compose_file" logs --no-color --tail 240 >&2 || true
        printf '\n--- receiver state ---\n' >&2
        for file in \
            "$state_dir/failure.txt" \
            "$state_dir/metric-1.received" \
            "$state_dir/log-1.received" \
            "$state_dir/metric-2.received" \
            "$state_dir/log-2.received"
        do
            if [[ -f "$file" ]]; then
                printf '\n%s\n' "$file" >&2
                cat "$file" >&2
            fi
        done
    fi

    docker compose -p "$project_name" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
for definition_number in 1 2; do
    mkdir -p \
        "$persistence_dir/encrypted-output-authorization-$definition_number/metrics" \
        "$persistence_dir/encrypted-output-authorization-$definition_number/logs"
done

python3 "$SCENARIO_DIR/generate_bootstrap.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --agent-ports "8081,8082" \
    --workflow "$SCENARIO_DIR/workflow.config.json" \
    --output "$fixture_dir/bootstrap.json"

cp "$fixture_dir/workflow-1.config.json" "$fixture_dir/workflow-2.config.json"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED STRING_SECRET_KEYS ENCRYPTED_AUTHORIZATION DECRYPTED_AUTHORIZATION

wait_for_file() {
    local path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        if [[ -s "$path" ]]; then
            return 0
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$path" >&2
    return 1
}

trigger_port() {
    local port="$1"
    local path="$2"
    docker compose -p "$project_name" -f "$compose_file" exec -T receiver python3 - "$port" "$path" <<'PY'
import sys
import time
import urllib.error
import urllib.request

port = sys.argv[1]
path = sys.argv[2]
url = f"http://agent:{port}{path}"
deadline = time.monotonic() + 30
while True:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            response.read()
        raise SystemExit(0)
    except urllib.error.HTTPError as error:
        if error.code == 500:
            raise SystemExit(0)
        raise
    except urllib.error.URLError:
        if time.monotonic() >= deadline:
            raise
        time.sleep(0.25)
PY
}

printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans >/dev/null

trigger_port 8081 /fail
trigger_port 8082 /fail

for definition_number in 1 2; do
    wait_for_file "$state_dir/metric-$definition_number.received"
    wait_for_file "$state_dir/log-$definition_number.received"
done

python3 - "$state_dir" <<'PY'
import pathlib
import sys

state = pathlib.Path(sys.argv[1])
failure = state / "failure.txt"
if failure.exists() and failure.read_text().strip():
    raise SystemExit(failure.read_text())
PY

printf 'Both bootstrap definitions used the same decrypted Authorization environment variable\n'
