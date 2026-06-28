# Encrypted Output Authorization

Black-box test using:

- the Opscotch dev-agent Docker image;
- a scenario-local Python HTTP receiver.

The agent loads two bootstrap definitions that share a mounted raw workflow.
Each workflow throws an intentional error. Both definitions' bootstrap-level
metric and log error outputs reference the same `TEST_OUTPUT_AUTH` environment
variable containing a `-2/...` encrypted string.

The receiver requires all four output requests (metric and log from each
definition) to carry the decrypted plaintext Authorization header. Ciphertext,
missing headers, or any missing request fails the scenario.

Optional image overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.6-dev \
./runtest.sh
```
