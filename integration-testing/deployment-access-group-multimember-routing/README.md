# Deployment Access Group Multimember Routing

Verifies that cross-deployment access groups support multiple deployment IDs
and that the caller bootstrap can route through a shared access-group ID to a
matching target deployment.

The scenario starts one caller bootstrap and two target bootstraps inside the
same agent container.

- the caller bootstrap declares a `call` access group named `bridge` with
  `deploymentIds` containing `remote-a` and `remote-b`;
- both target bootstraps declare a matching `receive` access group named
  `bridge` that allows calls from the caller deployment;
- the caller workflow uses `context.sendToStep('bridge', 'deliver', ...)` from
  a startup `runOnce` step;
- the target step emits a metric that the local receiver records under a path
  that identifies which target deployment actually ran.

Success requires:

- the receiver to observe exactly one metric request on `/metrics/remote-a`;
- no request to arrive on `/metrics/remote-b`;
- no failure marker to be written by the receiver.

Note: this scenario does not require explicit `/health` workflow endpoints.
Its observable contract is the routed metric output and receiver state.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

The scenario uses the Docker Opscotch agent image. Build the local dev image
first with:

```bash
/home/jeremy/dev/opscotch/hopscotch/agent/src/docker/container/build.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=opscotch-agent-java:dev \
INTEGRATION_TEST_TIMEOUT_SECONDS=90 \
./runtest.sh
```

The scenario is self-contained and does not require any external services.
