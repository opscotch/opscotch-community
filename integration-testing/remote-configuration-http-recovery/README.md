# Remote Configuration HTTP 404 Retry

Black-box test for the startup configuration watcher.

The scenario starts the agent with `bootstrap.remoteConfiguration` pointing to
a local HTTP fixture server. The fixture server returns `404` for every
`/workflow.json` request.

The scenario now uses `docker compose` so the agent and fixture server share a
user-defined Docker network, matching the newer integration-test pattern used
by the sibling compose-based scenarios. The agent should keep polling the
remote configuration and make a second fetch about one second after the first.

Success requires:

- at least two `/workflow.json` requests;
- both of the first two requests to return `404`;
- the second request to arrive about one second after the first.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64 \
INTEGRATION_TEST_TIMEOUT_SECONDS=90 \
./runtest.sh
```

Prerequisites:

- `docker`
- `python3`
- `OPSCOTCH_LEGAL_ACCEPTED`
