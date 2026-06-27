# Encrypted Output Authorization

Black-box test using:

- the Opscotch dev-agent Docker image;
- a scenario-local Python HTTP receiver.

The agent loads a mounted raw workflow that throws an intentional error. Its
bootstrap-level metric and log error outputs have `outputAuthorization` values
from an environment variable containing a `-2/...` encrypted string.

The receiver requires both output requests to carry the decrypted plaintext
Authorization header. Ciphertext, missing headers, or missing metric/log
requests fail the scenario.

Optional image overrides:

```bash
OPSCOTCH_AGENT_IMAGE=ghcr.io/opscotch/opscotch-agent:3.1.6-dev \
./runtest.sh
```
