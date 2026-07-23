# opscotch-key-store-local-storage

This app is the persistence deployment for `opscotch-key-store`. It accepts
only opaque public/secret records and never receives either key-store seed or
plaintext key material.

## Deployment contract

The production entry step is `accept-storage`, triggered by deployment access
ID `key-store-storage-call`. The expected caller is the key-store deployment.
There is no HTTP trigger or public HTTP listener.

Requests use these operations:

```json
{"operation":"getPair","pairId":"<pair-id>","publicRecordId":"<public-record-id>","secretRecordId":"<secret-record-id>","includeSecret":false}
```

```json
{"operation":"putPairIfAbsent","pairId":"<pair-id>","publicRecordId":"<public-record-id>","secretRecordId":"<secret-record-id>","publicRecord":{},"secretRecord":{}}
```

Records are opaque versioned envelopes. The storage app preserves and returns
their fields; it does not validate cryptographic meaning or decrypt them.

Outcomes are `ok`, `not-found`, `created`, `conflict`, or a safe
unavailable/provider error. Provider paths, file names, and raw record bodies
must not appear in caller-facing errors or diagnostics.

## Provider seam

`storage-provider.js` routes the contract to a configured provider:

- `local-file` stores an immutable pair bundle below the bootstrap storage
  root and commits it through a temporary file and move operation.
- `memory` is test-only and persists through the Opscotch step persistence
  mechanism.

An S3 provider can replace the local-file provider without changing the
key-store workflow. It must preserve opaque records and implement equivalent
atomic pair-create, conflict, not-found, and unavailable semantics. Bucket,
prefix, credentials, and permissions belong in storage bootstrap/configuration,
not in key-store code.

## Bootstrap and trust boundary

Storage bootstrap owns the provider selection and storage-root permission. It
has no seed-key configuration and no outbound deployment permission. The
receive permitter is the only inbound application boundary.

## Testing

The tests cover the memory contract, local-file atomic pair writes, malformed
records, and provider-unavailable behavior. The key-store integration tests
use a local test seam because the current testrunner cannot execute separate
deployments; production remains deployment-access-only.
