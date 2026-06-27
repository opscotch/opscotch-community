#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

declare -a available=()
declare -a selected=()

while IFS= read -r scenario; do
    available+=("$scenario")
done < <(
    find "$SCRIPT_DIR" -mindepth 2 -maxdepth 2 -type f -name runtest.sh -executable \
        -printf '%h\n' |
        xargs -r -n1 basename |
        sort
)

list_scenarios() {
    printf '%s\n' "${available[@]}"
}

scenario_exists() {
    local requested="$1"
    local scenario
    for scenario in "${available[@]}"; do
        if [[ "$scenario" == "$requested" ]]; then
            return 0
        fi
    done
    return 1
}

if [[ "${1:-}" == "--list" ]]; then
    list_scenarios
    exit 0
fi

if (( $# > 0 )); then
    for requested in "$@"; do
        if ! scenario_exists "$requested"; then
            printf 'Unknown integration scenario: %s\n' "$requested" >&2
            printf 'Available scenarios:\n' >&2
            list_scenarios >&2
            exit 2
        fi
        selected+=("$requested")
    done
else
    selected=("${available[@]}")
fi

if (( ${#selected[@]} == 0 )); then
    printf 'No integration scenarios found in %s\n' "$SCRIPT_DIR" >&2
    exit 2
fi

failed=0

for scenario in "${selected[@]}"; do
    scenario_dir="$SCRIPT_DIR/$scenario"
    started_at=$SECONDS

    printf '\n==> RUN  %s\n' "$scenario"
    if (
        cd "$scenario_dir"
        ./runtest.sh
    ); then
        printf '==> PASS %s (%ss)\n' "$scenario" "$((SECONDS - started_at))"
    else
        status=$?
        failed=$((failed + 1))
        printf '==> FAIL %s (exit %s, %ss)\n' \
            "$scenario" "$status" "$((SECONDS - started_at))" >&2
    fi
done

printf '\nScenarios: %s, failed: %s\n' "${#selected[@]}" "$failed"

if (( failed > 0 )); then
    exit 1
fi
