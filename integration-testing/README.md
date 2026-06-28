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

Scenarios should prefer the Docker Opscotch agent. Dev-agent scenarios may
mount raw workflow JSON directly; use the standalone packager only when
packaging behavior or production-mode loading is part of the scenario.
Implementations are otherwise unrestricted and may build mock services in
Python or another suitable language.

Image names should be configurable through environment variables so scenarios
can run against a release, candidate, or locally built image.

Temporary files should be created outside the repository with `mktemp -d` and
removed from an `EXIT` trap.
