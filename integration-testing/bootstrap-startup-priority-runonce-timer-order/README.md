# Bootstrap Startup Priority RunOnce Timer Order

Verifies that bootstrap definitions activate in `startupPriority` order and
that startup-triggered `runOnce` executions complete in `startupPriority`
order before the periodic timer executions begin.

The scenario creates three bootstrap definitions with distinct startup
priorities:

1. `bootstrap-priority-01` with priority `1`
2. `bootstrap-priority-05` with priority `5`
3. `bootstrap-priority-10` with priority `10`

All three reuse the same workflow template. Bootstrap data supplies a unique
label per deployment, and the workflow steps use that label to emit distinct
log and metric tokens.

Each deployment has two startup-triggered steps:

- a `runOnce` step that emits one metric and one diagnostic log;
- a timer step with `delay: 1000` and a long period so its first periodic
  execution lands after the startup `runOnce` pass but does not repeat during
  the test window.

The receiver records ordered metric and log journals. Success requires:

- the agent startup log to show activation in `startupPriority` order;
- the metric journal to contain the expected tokens in order;
- the log journal to contain the expected tokens in order.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64 \
INTEGRATION_TEST_TIMEOUT_SECONDS=90 \
./runtest.sh
```

The scenario follows the community integration-test contract:

- it uses a local receiver with `/health` and bounded polling;
- it writes generated fixtures outside the repository;
- it keeps cleanup self-contained and reports useful failure diagnostics.

The runner sorts metric and log records by their emitted timestamps at the end
of the run, then asserts the ordered token streams. The first wave should be
all `runOnce` emissions in startup priority order, followed by the periodic
timer emissions about 1 second later.
