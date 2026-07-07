# Opscotch Community Integration Testing

This directory contains Opscotch integration scenarios. It is
independent of the public integration test runner.

## Running tests

Run every scenario:

```bash
./integration-testing/runtest.sh
```

Run selected scenarios:

```bash
./integration-testing/runtest.sh encrypted-output-authorization
```

List available scenarios:

```bash
./integration-testing/runtest.sh --list
```

The root runner executes every selected scenario and exits non-zero when any
scenario fails.

Scenarios containing a `.manual` marker are listed and can be selected
explicitly, but are excluded when the root runner is invoked without scenario
names.

## Scenario contract

Each immediate subdirectory is a scenario and must contain an executable
`runtest.sh`.

The scenario script:

- is executed with its scenario directory as the working directory;
- must resolve repository paths relative to its own location;
- owns its fixtures, temporary processes, ports, assertions, and cleanup;
- writes useful failure details to standard error;
- exits `0` on success and non-zero on failure.
- prints the Docker image it will use immediately before each `docker run`
  invocation, including repeated runs for restart or multi-phase scenarios.

Scenarios should prefer the Docker Opscotch agent. Dev-agent scenarios may
mount raw workflow JSON directly; use the standalone packager only when
packaging behavior or production-mode loading is part of the scenario.
Implementations are otherwise unrestricted and may build mock services in
Python or another suitable language.

Image names should be configurable through environment variables so scenarios
can run against a release, candidate, or locally built image.

Temporary files should be created outside the repository with `mktemp -d` and
removed from an `EXIT` trap.

## Guide for complex scenarios

Use the existing scenarios as executable examples, not just as fixtures to
copy. Before writing code, read this file, the README and `runtest.sh` of the
closest scenario, and any helper scripts that it uses. Keep the new test
focused on one externally observable behavior.

### Choose the test shape

- Prefer a black-box test against the Docker agent.
- Use the dev-agent image and mount raw workflow JSON when the behavior does
  not depend on packaging.
- Use the standalone packager or a production image only when packaging or
  production-mode loading is the behavior under test.
- Reuse a helper from another scenario only when the coupling is explicit and
  stable. Otherwise keep the scenario self-contained.
- Do not modify the root runner for a normal scenario. It discovers executable
  `*/runtest.sh` files automatically.

### Scenario layout

A typical scenario contains:

```text
descriptive-scenario-name/
├── README.md             # behavior, phases, assertions, and run options
├── runtest.sh            # orchestration, assertions, diagnostics, cleanup
├── generate_fixtures.py  # generated bootstrap/workflows and expected values
├── receiver.py           # local fake service and observable state
└── reserve_ports.py      # ephemeral loopback port allocation, when needed
```

Static workflow or bootstrap files are appropriate for small fixtures.
Generate them when ports, deployment counts, phases, or expected outputs are
dynamic. Generated files belong in the scenario's temporary directory, not in
the repository.

Add an empty `.manual` file only when the scenario must not run in the default
suite, for example because it is destructive, unusually slow, or needs
credentials or infrastructure beyond the documented suite prerequisites.

### Authoring sequence

1. Define the behavior and failure signal in the scenario README. State what
   starts the behavior, what crosses the process boundary, and what exact
   evidence proves success.
2. Give every expected output a deterministic, unique token. Generate the
   expected token set from the same declared dimensions used to generate the
   workflows, such as deployment, phase, kind, and item number.
3. Build the smallest local fake service needed to observe the behavior. Give
   it a `/health` endpoint and write machine-readable state under a supplied
   state directory.
4. Write `runtest.sh` to allocate resources, generate fixtures, start the fake
   service, start the agent, trigger the behavior, wait for bounded conditions,
   and assert the final state.
5. Run the scenario directly, then run it through the root runner to verify the
   discovery and working-directory contract.

### `runtest.sh` requirements

Start scripts with:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AGENT_IMAGE="${OPSCOTCH_AGENT_IMAGE:-ghcr.io/opscotch/opscotch-agent:3.1.7-dev}"
TIMEOUT_SECONDS="${INTEGRATION_TEST_TIMEOUT_SECONDS:-90}"
```

Then apply these rules:

- Check required commands before creating resources. Exit `2` for a missing
  prerequisite or invalid configuration.
- Require `OPSCOTCH_LEGAL_ACCEPTED` to be set in the user's shell environment for Docker agent tests.
- Use unique container names containing `$$`; never assume a globally fixed
  name or port.
- Allocate loopback ports dynamically. A reserved port has a small race after
  its reservation socket closes, so bind the service promptly.
- Use `--network host` when the container must reach a receiver bound to
  `127.0.0.1`, and use read-only mounts for fixtures where possible.
- Make agent images configurable with `OPSCOTCH_AGENT_IMAGE`.
- Put all generated fixtures, receiver state, logs, and persistence below one
  `mktemp -d` directory.
- Install the cleanup trap immediately after resource variables are
  initialized. Cleanup must tolerate partially started processes and
  containers.
- On failure, print relevant receiver and agent logs to standard error. For
  large logs, print a useful tail rather than unbounded output.
- For scenarios with valuable failure artifacts, support
  `KEEP_FAILED_INTEGRATION_TEST=1` and print the retained directory.
- End with a concise success message describing the verified behavior.

### Waiting and assertions

Integration tests are asynchronous. Never use a long fixed sleep as the main
success condition.

- Poll health, completion markers, or state files with a deadline based on
  `INTEGRATION_TEST_TIMEOUT_SECONDS`.
- Use short sleeps, normally `0.25` seconds, between polls.
- While polling, check `failure.txt` (or an equivalent explicit failure
  marker) and fail immediately when it appears.
- A timeout must report what was expected and include useful counts or a sample
  of missing tokens.
- Assert complete sets or exact invariants, not only non-zero activity. For
  example, compare all expected metric names, validate request headers, count
  activations, or inspect persisted records.
- Use targeted sleeps only when elapsed time is itself under test, such as
  retry cadence or warning suppression.

The receiver should reject malformed or unexpected requests immediately,
record the reason in `failure.txt`, and return a suitable non-success status.
Protect shared in-memory and on-disk state with a lock because
`ThreadingHTTPServer` handles requests concurrently. Write request journals as
NDJSON when the test needs ordering, timestamps, retry counts, body hashes, or
batch sizes.

### Lifecycle and persistence tests

When testing restart or durability:

- Mount persistence from the temporary host directory so it survives container
  replacement.
- Verify the expected data is actually persisted before stopping the agent.
- Stop with the grace period required by the behavior under test and record
  the container exit state and pre-restart logs.
- Restart with the same fixtures and persistence directory.
- Distinguish outputs from separate runs by resetting receiver state or using
  unique tokens.

### Validation checklist

Before considering a scenario complete, verify:

```bash
# Syntax and Python parsing
bash -n integration-testing/descriptive-scenario-name/runtest.sh
python3 -m py_compile integration-testing/descriptive-scenario-name/*.py

# Discovery
./integration-testing/runtest.sh --list

# Direct execution
./integration-testing/descriptive-scenario-name/runtest.sh

# Root-runner execution
./integration-testing/runtest.sh descriptive-scenario-name
```

Also confirm that:

- `runtest.sh` is executable;
- the test has a bounded timeout and cannot hang indefinitely;
- success depends on the intended behavior, so breaking that behavior would
  make the test fail;
- cleanup leaves no container, process, port, or temporary directory behind;
- secrets and credentials are supplied through environment variables and are
  not printed in diagnostics;
- the README documents prerequisites, image overrides, timeout overrides,
  manual status, and any known-version regression behavior.
