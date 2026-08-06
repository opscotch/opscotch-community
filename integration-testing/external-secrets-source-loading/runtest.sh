#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-10}"
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

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/opscotch-external-secrets-source-loading.XXXXXX")"
project_name="opscotch-external-secrets-source-loading-$$"
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
            "$state_dir/complete.txt" \
            "$state_dir/received-paths.json"
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

mkdir -p "$fixture_dir" "$state_dir" "$persistence_dir"
for deployment_id in \
    external-secrets-file \
    external-secrets-url \
    external-secrets-hostrecord \
    external-secrets-combined
do
    mkdir -p "$persistence_dir/$deployment_id/metrics"
done

python3 "$SCENARIO_DIR/generate_fixtures.py" \
    --receiver-host receiver \
    --receiver-port 8080 \
    --output-directory "$fixture_dir"

export SCENARIO_DIR FIXTURE_DIR="$fixture_dir" STATE_DIR="$state_dir" PERSISTENCE_DIR="$persistence_dir" AGENT_IMAGE OPSCOTCH_LEGAL_ACCEPTED
export BOOTSTRAP_FILE=bootstrap-file.json OPSCOTCH_SECRETS_FROM=file:/fixtures/file.properties

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

wait_for_received_path() {
    local expected_path="$1"
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if [[ -s "$state_dir/failure.txt" ]]; then
            cat "$state_dir/failure.txt" >&2
            return 1
        fi
        if python3 - "$state_dir/received-paths.json" "$expected_path" <<'PY'
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
    printf 'Timed out waiting for received path %s\n' "$expected_path" >&2
    return 1
}

reset_receiver_state() {
    docker compose -p "$project_name" -f "$compose_file" exec -T receiver python3 - <<'PY'
import urllib.request
urllib.request.urlopen(
    urllib.request.Request("http://127.0.0.1:8080/reset", method="POST"),
    timeout=5,
).read()
PY
}

wait_for_receiver() {
    local deadline=$((SECONDS + TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        if docker compose -p "$project_name" -f "$compose_file" logs --no-color receiver 2>/dev/null | grep -q 'Serving'; then
            return 0
        fi
        sleep 0.25
    done
}

run_phase() {
    local bootstrap_file="$1"
    local source_spec_file="$2"
    local expected_path="$3"

    printf 'Using Docker image: %s\n' "$AGENT_IMAGE" >&2
    export OPSCOTCH_SECRETS_FROM="$(<"$fixture_dir/$source_spec_file")" BOOTSTRAP_FILE="$bootstrap_file"
    docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --force-recreate agent >/dev/null

    wait_for_received_path "$expected_path"
    reset_receiver_state
}

docker compose -p "$project_name" -f "$compose_file" up -d --remove-orphans --wait receiver >/dev/null
reset_receiver_state

run_phase bootstrap-file.json file-source.txt /metrics/file
run_phase bootstrap-url.json url-source.txt /metrics/url
run_phase bootstrap-hostrecord.json hostrecord-source.txt /metrics/hostrecord
run_phase bootstrap-combined.json combined-source.txt /metrics/file/url/hostrecord

python3 - "$state_dir/received-paths.json" "$fixture_dir/expected-paths.json" <<'PY'
import json
import pathlib
import sys

received = json.loads(pathlib.Path(sys.argv[1]).read_text()) if pathlib.Path(sys.argv[1]).exists() else []
expected = json.loads(pathlib.Path(sys.argv[2]).read_text())
if sorted(received) != sorted(expected):
    raise SystemExit(f"unexpected received paths: {received}")
PY

printf 'Verified file, URL, hostrecord, and combined external secret sources with docker compose\n'
