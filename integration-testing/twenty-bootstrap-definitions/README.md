# Twenty Bootstrap Definitions

Stress-tests the report that an Opscotch 3.1.6 agent cannot run metric
collection workflows when configured with more than six bootstrap definitions.

The scenario generates 20 bootstrap definitions. Each definition loads a
separate raw workflow containing:

- a run-once heartbeat step that emits item `001`;
- a run-once collection step that emits items `002` through `100`.

Every item produces one uniquely named metric and one uniquely identifiable
diagnostic log. A scenario-local receiver therefore requires 2,000 metrics and
2,000 logs. The script also verifies successful final activation for all 20
deployments.

The agent container is then stopped and started again with the same bootstrap
and persistence volume. All 4,000 expected outputs and activation assertions
must pass again within the configured timeout.

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
