# Worker Pool Saturation

This scenario ramps concurrent workflow load until the monitoring signals show
pressure, so you can quantify the agent's practical capacity instead of only
checking a single burst.

The split is deliberate:

- `main.go` is only the fake HTTP target.
- `receiver.py` collects workflow metrics, workflow logs, and native agent
  metrics using the same receiver pattern used by other integration tests.

## What it does

- starts a local Go service that tracks concurrent requests and writes a
  request journal;
- starts a Python receiver that records `/metrics`, `/logs`, and
  `/agent-metrics`;
- runs one bootstrap with one workflow definition;
- the workflow has twenty timer-triggered steps, each starting one minute after
  the previous step;
- each step repeats every second and fans out to the Go target with a 10 second
  request delay;
- the runner tails the agent container live and stops the container on the
  first non-shutdown `ERROR` log line;
- the capacity summary records the observed knee and the stop reason in
  `capacity-summary.json`.

Pressure is currently treated as:

- the target's observed max concurrency falling behind the requested peak
  concurrency.

Native agent metrics are still captured for inspection, but they are not used
to decide capacity.

The agent is run with `OPSCOTCH_TIMER_ACTIVE_MAX=1000` so overlapping timer
fires do not become the bottleneck before the worker pool does.

The default ramp is intentionally high enough to push well past the prior
55-concurrency observation before the first real agent error forces shutdown.

Requests canceled during agent shutdown are tracked separately as
`canceledRequests`; they remain in the request journal and logs, but they are
not counted as failed work for the capacity summary.

## Files

- `generate_fixtures.py` writes the single workflow and bootstrap fixture bundle
  for the ramp.
- `receiver.py` captures workflow and agent output.
- `reserve_ports.py` reserves the collector and target ports.
- `runtest.sh` runs the full ramp and emits the capacity summary.

## Local checks

```bash
go test ./...
python3 -m py_compile receiver.py generate_fixtures.py reserve_ports.py
```
