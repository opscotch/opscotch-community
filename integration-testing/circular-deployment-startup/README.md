# Circular Deployment Startup

Verifies that two deployments with reciprocal `allowDeploymentAccess` rules
can both load and activate at startup. The deployment access graph is:

```text
alpha -> beta -> alpha
```

Run against a candidate or released dev-agent image:

```bash
OPSCOTCH_LEGAL_ACCEPTED=yes \
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent-beta:3.1.8-20-dev-linux-amd64 \
./runtest.sh
```

For the regression demonstration, use
`ghcr.io/opscotch/opscotch-agent-beta:3.1.8-19-dev-linux-amd64`. That image
uses dependency-gated startup and exits after timing out on the cycle, so this
scenario is expected to fail. A fixed runtime logs a circular call-access
warning and successful activation for both deployments.
