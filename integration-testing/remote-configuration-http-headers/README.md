# Remote Configuration HTTP Headers

Black-box test for the live `HttpWatcher` path.

The scenario starts the agent with `bootstrap.remoteConfiguration` pointing to
a local HTTP fixture server. The scenario uses `docker compose` so the receiver
and agent share a user-defined Docker network instead of relying on host
networking. The fixture server serves the workflow JSON and verifies that every
fetch carries the expected watcher headers:

- `octstream: true`
- `X-Config-Scenario`
- `X-Config-Trace`
- `Authorization`

The loaded workflow exposes an HTTP trigger on the agent itself. After the
first successful configuration fetch, the test calls that trigger once through
`docker compose exec` and expects one metric and one diagnostic log to reach
the local receiver.

Success requires:

- every `/workflow.json` request to include the expected headers;
- the workflow fetch to complete on the live polling path, not the one-shot
  loader;
- one metric request and one log request to reach the receiver after the HTTP
  trigger is invoked.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=<valid-token> ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64 \
INTEGRATION_TEST_TIMEOUT_SECONDS=18 \
./runtest.sh
```

The scenario follows the community integration-test contract:

- it uses a local Python receiver with `/health`;
- it keeps all generated fixtures, logs, and state under a temporary directory.
- it expects `OPSCOTCH_LEGAL_ACCEPTED` to come from the user environment and
  contain a valid token.
