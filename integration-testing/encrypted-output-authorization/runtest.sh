#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.6-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-45}"

STRING_SECRET_KEYS="D94445ACC6379E16CB12878C8524F7C2A6226BB4FDA8CA4357F40251C67FBA6B/C87321EB00BE4E3C6B8890CB68F61BD40CCBB013BD3D62878F50810885988EE3"
ENCRYPTED_AUTHORIZATION="-2/AQABGGfiU9bPgJ9RPhiIAQG86+VUlD4RaV5qbwFGpy6inX2y0OqU0uP3MTO8KtZ/jsAH8zCEa4OYZSAwuqkIyxFOK/tUJOekGadQoHvSzLLe9qf7hCdcWJVRrBhGwq/coVhERQF0txP2+pfq73bOFUKofZ5UAjyTuOMbA5HMrSGFDH1iFN8jJbX8vI7fPlGXrl/sQRQ1TQgnVyTkmBXNFAIhi13sDt1ULIc0Gub4Hdvfqpj0r8oeNMXANJaRFOQuGZ9wM3jzwqPRgGonDaVWKIUt5eV+GqA5oVI="
DECRYPTED_AUTHORIZATION="Basic cGhtX21vbml0b3Jpbmc6azV5OHJHc0JDNzBvTXU2REJkQQ=="

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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-encrypted-output-auth.XXXXXX")"
container_suffix="encrypted-output-auth-$$"
agent_container="opscotch-agent-$container_suffix"
receiver_pid=""

cleanup() {
    status=$?

    if (( status != 0 )); then
        printf '\n--- receiver log ---\n' >&2
        sed -n '1,240p' "$temp_dir/receiver.log" >&2 2>/dev/null || true
        printf '\n--- agent log ---\n' >&2
        docker logs "$agent_container" >&2 2>/dev/null || true
    fi

    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" 2>/dev/null || true
        wait "$receiver_pid" 2>/dev/null || true
    fi
    docker rm -f "$agent_container" >/dev/null 2>&1 || true
    rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

read -r receiver_port agent_port < <(
    python3 "$SCENARIO_DIR/reserve_ports.py" 2
)

mkdir -p "$temp_dir/persistence"

python3 "$SCENARIO_DIR/receiver.py" \
    --port "$receiver_port" \
    --expected-authorization "$DECRYPTED_AUTHORIZATION" \
    --state-directory "$temp_dir" \
    >"$temp_dir/receiver.log" 2>&1 &
receiver_pid=$!

wait_for_url() {
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

wait_for_file() {
    local path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$path" ]]; then
            return 0
        fi
        if [[ -s "$temp_dir/failure.txt" ]]; then
            cat "$temp_dir/failure.txt" >&2
            return 1
        fi
        sleep 0.25
    done
    printf 'Timed out waiting for %s\n' "$path" >&2
    return 1
}

wait_for_url "http://127.0.0.1:$receiver_port/health"

python3 "$SCENARIO_DIR/generate_bootstrap.py" \
    --agent-port "$agent_port" \
    --receiver-port "$receiver_port" \
    --output "$temp_dir/bootstrap.json"

docker run --detach --rm \
    --name "$agent_container" \
    --network host \
    --volume "$temp_dir:/config:ro" \
    --volume "$SCENARIO_DIR:/scenario:ro" \
    --volume "$temp_dir/persistence:/persistence" \
    --env BOOTSTRAP_FILE=bootstrap.json \
    --env OPSCOTCH_LEGAL_ACCEPTED \
    --env OPSCOTCH_STRING_SECRETKEYS="$STRING_SECRET_KEYS" \
    --env TEST_OUTPUT_AUTH="$ENCRYPTED_AUTHORIZATION" \
    "$AGENT_IMAGE" >/dev/null

wait_for_url "http://127.0.0.1:$agent_port/health"

curl --silent --show-error \
    --max-time 5 \
    "http://127.0.0.1:$agent_port/fail" \
    --output "$temp_dir/trigger-response.txt" || true

wait_for_file "$temp_dir/metric.received"
wait_for_file "$temp_dir/log.received"

if [[ -s "$temp_dir/failure.txt" ]]; then
    cat "$temp_dir/failure.txt" >&2
    exit 1
fi

printf 'Metric and log outputs used the decrypted Authorization header\n'
