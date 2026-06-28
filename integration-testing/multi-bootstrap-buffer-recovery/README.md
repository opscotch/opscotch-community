# Multi-Bootstrap Buffer Recovery

Exercises output retry, buffering, and recovery across 20 bootstrap
definitions.

The scenario:

1. Starts a receiver and the Docker dev agent.
2. Verifies normal metric and log delivery.
3. Verifies connection-refused retries, one warning per outage, and recovery.
4. Verifies retries and recovery for HTTP 400, 401, 404, 500, and 302.
5. Verifies the median retry interval is between 0.5 and 2.5 seconds.
6. Delays responses for 15 seconds to exceed the agent's 10-second HTTP
   timeout, then verifies recovery.
7. Verifies all 2,500 metrics arrive and no request exceeds the 1,000-record
   batch boundary.

Run directly:

```bash
./runtest.sh
```

Optional configuration:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.6-dev \
INTEGRATION_TEST_TIMEOUT_SECONDS=90 \
./runtest.sh
```
