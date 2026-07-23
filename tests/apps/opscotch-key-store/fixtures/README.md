# opscotch-key-store test fixtures

These fixtures are local to the key-store app. The storage app keeps its own
copy so each deployment's tests remain self-contained.

- `key-store-requests.json` — external key-store request envelopes.
- `key-store-responses.json` — successful and safe error responses.
- `storage-requests.json` — opaque storage-app request envelopes.
- `storage-responses.json` — storage success, not-found, conflict, and failure
  responses.
- `encrypted-records.json` — representative versioned opaque record shapes.
