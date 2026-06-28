# Multi-Bootstrap Buffer Recovery

Exercises output buffering and recovery across 20 bootstrap definitions.

The scenario:

1. Starts a receiver and the Docker dev agent.
2. Triggers an online batch from every deployment and verifies delivery.
3. Stops the receiver.
4. Triggers a larger batch from every deployment while both metric and log
   endpoints are unavailable.
5. Waits for the agent to attempt delivery and record connection failures.
6. Restarts the receiver on the same port.
7. Requires every buffered metric and log token to be delivered.

Per run:

- Online phase: 500 unique metrics and 500 unique logs.
- Buffered phase: 2,000 unique metrics and 2,000 unique logs.
- Deployments: 20.

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
