# External Secrets Source Loading

This scenario verifies that `OPSCOTCH_SECRETS_FROM` can load secrets from:

- a local file source;
- a plain HTTP URL;
- a `hostrecord:` source; and
- all three sources in one quoted semicolon-separated string.

The scenario uses one local mock server for both secret responses and
metric collection. Each phase starts a fresh agent container with a different
`OPSCOTCH_SECRETS_FROM` value and a bootstrap file that resolves a placeholder
from the loaded secrets into the metric output URL.

Success requires the receiver to observe these request paths:

- `/metrics/file`
- `/metrics/url`
- `/metrics/hostrecord`
- `/metrics/file/url/hostrecord`

That proves the file, plain URL, and hostrecord sources all load correctly and
that the combined configuration can read all three sources at once.

Run:

```bash
OPSCOTCH_LEGAL_ACCEPTED=... ./runtest.sh
```

Optional overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.7-dev-linux-amd64 \
INTEGRATION_TEST_TIMEOUT_SECONDS=90 \
./runtest.sh
```

The scenario follows the community integration-test contract:

- it uses a local mock server with `/health`;
- it creates fixtures outside the repository with `mktemp -d`;
- it runs each phase with bounded polling and cleanup.
