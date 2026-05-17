# Opscotch Resource Unit Tests

This directory contains Vitest-based unit tests for JavaScript resources under `community/opscotch-community/resources`.

These tests are intended for fast feedback on resource behavior without running the full Opscotch agent and integration test harness.

For full workflow and transport-level behavior, continue to use the existing integration tests under `community/opscotch-community/tests`.

## Directory Layout

- `resources/`
  Resource JavaScript files under test.
- `unit-tests/`
  Vitest unit tests for those resources.
- `tests/`
  Existing Opscotch integration harness tests.

Recommended convention:

- resource: `resources/general/standard-clear-body.js`
- test: `unit-tests/general/standard-clear-body.test.ts`

## Coverage Trackers

Two markdown files in this directory track current status:

- [resource-test-checklist.md](/home/jeremy/dev/opscotch/community/resource-test-checklist.md)
  Resources that already have passing unit tests are checked off here.
- [resource-too-complex-for-current-scope.md](/home/jeremy/dev/opscotch/community/resource-too-complex-for-current-scope.md)
  Resources that are currently out of scope for the stub-first unit runtime are listed here.

## Default Test Runner

The recommended runner is the published GHCR image:

- `ghcr.io/opscotch/opscotch-resource-testkit:latest`

This image provides:

- Vitest
- an Opscotch `doc` and `context` runtime shim
- a real in-memory byte buffer implementation
- stubbed or mockable complex contexts such as `crypto()`, `files()`, and `queue()`

## Running All Unit Tests With Docker

Mount the community repository at `/workspace` and run the image with no extra arguments:

```bash
docker run --rm \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

Example from this repo:

```bash
docker run --rm \
  -v /home/jeremy/dev/opscotch/community/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

By default the image runs tests from:

```text
/workspace/unit-tests
```

## Running A Single Test File With Docker

Set `UNIT_TEST_PATH` to a single `.test.ts` file:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests/general/standard-clear-body.test.ts \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

## Running A Set Of Tests With Docker

Set `UNIT_TEST_PATH` to a directory:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests/general \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

More examples:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests/httpserver \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests/tests-only \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest
```

## Passing Additional Vitest Filters With Docker

Additional arguments after the image name are forwarded to `vitest run`.

Filter by test name:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests/general \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest \
  --testNamePattern="clears the current body"
```

Filter by filename pattern:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest \
  standard-url-generator
```

Run with a Vitest reporter:

```bash
docker run --rm \
  -e UNIT_TEST_PATH=/workspace/unit-tests \
  -v /path/to/opscotch-community:/workspace:ro \
  ghcr.io/opscotch/opscotch-resource-testkit:latest \
  --reporter=verbose
```

## Running Tests Locally Without Docker

The local package-based path now uses the published npmjs package `@opscotch/resource-testkit@0.1.2`.

Then install the local test dependencies from the `unit-tests` directory:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npm install
```

Run all unit tests locally:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npm test
```

Run a single test file:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npx vitest run general/standard-clear-body.test.ts
```

Run a directory of tests:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npx vitest run httpserver
```

Run a filtered subset:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npx vitest run --testNamePattern="authorization"
```

Run a TypeScript check for editor/build validation:

```bash
cd /home/jeremy/dev/opscotch/community/opscotch-community/unit-tests
npm run check
```

Important for IDE support:

- install the dependencies in `community/opscotch-community/unit-tests`
- the folder now resolves `@opscotch/resource-testkit` as a normal package dependency instead of a monorepo-only source path
- if your editor still shows stale errors after install, reload the TypeScript project or restart the editor window

## Monorepo Runtime Verification

If you are working inside this repo and want to verify the Docker-first runtime app itself, use the app package directly:

```bash
cd /home/jeremy/dev/opscotch/apps/public-apps/opscotch-resource-testkit
npm ci
npm test
npm run test:community
```

## Writing New Tests

General approach:

1. Choose a resource file to add tests for.
2. Create a matching `.test.ts` file under the mirrored path in `unit-tests/`.
3. Use `runResource(...)` from `@opscotch/resource-testkit`.
4. Build a mock context with `createJavascriptContext(...)` or `createAuthenticationJavascriptContext(...)`.
5. Assert on the resulting body, properties, headers, metrics, split return items, `sendToStep` calls, or recorded stub warnings.
6. Run the test until it passes.

## Current Scope Limits

The current runtime is intentionally stub-first.

Good candidates for unit tests right now:

- body and property transformations
- header handling
- URL generation
- simple forwarding logic
- metrics, splits, and timestamp-manager behavior
- byte buffer usage where the current shim already supports it

Common reasons a resource may still be too complex for this scope:

- filesystem-heavy behavior
- external host integration semantics
- high-fidelity crypto behavior
- restricted-data flows that depend on richer authentication runtime support
- large framework-level orchestration logic better covered by integration tests
