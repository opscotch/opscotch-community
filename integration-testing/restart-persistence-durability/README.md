# Restart Persistence Durability

Isolates buffered metric durability across an agent restart for 20 bootstrap
definitions.

The scenario:

1. Starts the Docker dev agent with persistence mounted from the host.
2. Emits 20 unique metrics from each deployment while the receiver is down.
3. Requires every metric sender's persisted `STEP_LAST` to contain its restart
   batch.
4. Stops the container with a 120-second grace period.
5. Records Docker exit state, shutdown markers, and persistence integrity.
6. Restarts the agent with the same persistence volume.
7. Requires all 400 metrics to reach the receiver.

This is a regression test: it currently fails on 3.1.6 because persisted
restart batches are cleared before or during shutdown.

Run directly:

```bash
./runtest.sh
```

Set `KEEP_FAILED_INTEGRATION_TEST=1` to retain logs, persistence snapshots, and
the shutdown report after a failure.
