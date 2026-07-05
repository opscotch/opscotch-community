# Workflow Timer Staggered Startup Delay

Two-phase black-box test for `bootstrap.workflow.timers.staggerPct`.

The scenario loads one bootstrap definition with one workflow timer that emits
a single metric. The timer has `period: 60000` and no explicit delay, so the
agent either starts it immediately or applies a one-time startup stagger.

Phase 1 omits `workflow.timers` entirely:

- no stagger log should appear;
- the metric timestamp is recorded relative to the `Agent startup complete`
  log line and becomes the baseline offset.

The baseline bootstrap omits `workflow.timers` entirely so the agent uses the
default value.

Phase 2 runs with `staggerPct: 100`:

- the stagger log should appear with a resolved delay in milliseconds;
- the metric timestamp should shift by that logged delay relative to the
  phase 1 baseline.

The scenario uses a local Python receiver for workflow metrics and compares the
agent log timestamps against the metric payload timestamps.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.6-dev \
INTEGRATION_TEST_TIMEOUT_SECONDS=120 \
./runtest.sh
```

Prerequisites:

- `docker`
- `curl`
- `python3`
- `OPSCOTCH_LEGAL_ACCEPTED`
