# Shutdown HTTP Drain Timeout

Verifies the agent shutdown behavior for an in-flight workflow HTTP call.

The scenario runs two phases against the same blocking HTTP endpoint:

1. Phase 1 sets `workflow.shutdownTimeout` long enough for the blocking call
   to finish. Shutdown should wait for the HTTP request to complete cleanly.
2. Phase 2 sets `workflow.shutdownTimeout` to 1 second. Shutdown should log
   the timeout error message, cancel the HTTP call after the grace period, and
   still exit normally.

The workflow issues a single zero-delay timer-triggered HTTP GET to a local
fixture server that sleeps for 20 seconds before responding. The runner waits
until the request is in flight, then stops the agent and inspects:

- the fixture server state file for completed versus canceled requests;
- the agent log for the shutdown timeout message in phase 2;
- shutdown duration for both phases.

The runner copies phase logs, server state, fixtures, and persistence data into
the artifact directory so failed runs still leave useful files behind.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

- `OPSCOTCH_AGENT_IMAGE`
- `INTEGRATION_TEST_TIMEOUT_SECONDS`
- `INTEGRATION_TEST_ARTIFACT_DIR`
- `KEEP_FAILED_INTEGRATION_TEST`
- `OPSCOTCH_AGENT_CPUS`
- `OPSCOTCH_AGENT_MEMORY`
- `OPSCOTCH_AGENT_PIDS_LIMIT`
