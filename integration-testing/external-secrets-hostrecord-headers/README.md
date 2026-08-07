# External Secrets Hostrecord Headers

This scenario verifies that the dev agent uses headers declared in a
`hostrecord:` secret source when it fetches the secret payload.

The scenario starts a local receiver and a Docker agent container with
`OPSCOTCH_SECRETS_FROM` set to a base64-encoded hostrecord fixture. The
hostrecord points back to the receiver and declares arbitrary headers that
must be sent on the secret fetch request.

Success requires:

- the receiver to observe the declared headers on `GET /secret.properties`;
- the secret load to succeed far enough for the workflow to emit one metric;
- the metric request to land on the path provided by the secret payload.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent-beta:3.1.8-2-dev-linux-amd64 \
INTEGRATION_TEST_TIMEOUT_SECONDS=30 \
./runtest.sh
```

The scenario follows the community integration-test contract:

- it uses `docker compose` with a local Python receiver;
- it keeps generated fixtures and state under a temporary directory;
- it fails fast if the secret-fetch headers do not match the hostrecord.
