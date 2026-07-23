# opscotch-key-store requirements

## 1. Purpose and scope

`opscotch-key-store` provides immutable cryptographic key pairs to authorized
Opscotch services. A pair is identified by a caller-assigned `keyId` and a
required crypto `purpose`, for example:

```json
{
  "keyId": "my-app-identity",
  "purpose": "authenticated"
}
```

The key-store owns request validation, key generation, derivation, encryption,
integrity verification, and response shaping. A separate storage deployment
owns persistence of opaque records. The initial providers are:

- `opscotch-key-store-local-storage` for local files;
- `opscotch-key-store-dynamodb` for DynamoDB through `aws-services`.

`opscotch-key-store-http` is a separate adapter that exposes HTTP and calls the
deployment-access-only key-store app. The key-store itself must not expose an
HTTP listener or endpoint.

Migration of the existing single-value record format is not required. The new
implementation may reject or ignore old records.

## 2. Goals

- Generate one immutable key pair for each `(keyId, purpose)` identity.
- Return existing pairs without generating replacements.
- Allow a public-only deployment to return public keys without possessing the
  secret seed.
- Ensure a deployment without the secret seed cannot decrypt or return secret
  keys mathematically.
- Store public and secret components as separate records in one storage table.
- Derive distinct public and secret record IDs using domain separation.
- Encrypt and authenticate secret material before it reaches storage.
- Make pair creation atomic and safe under concurrent requests.
- Keep local-file and DynamoDB implementations behind the same storage contract.
- Use Opscotch Crypto and Byte contexts for all cryptographic and byte-buffer
  operations.
- Make cross-deployment authorization explicit in bootstrap.

## 3. Non-goals

- Key rotation, replacement, or version updates.
- Migration or compatibility support for old single-value records.
- Arbitrary caller-provided secret `put` operations.
- Secret version history or rollback.
- A general-purpose database abstraction.
- An administrative UI.
- Putting HTTP handling or authentication into the key-store deployment.

## 4. Terminology

- **Key ID**: the caller-assigned, non-secret identifier such as
  `my-app-identity`.
- **Purpose**: the required Opscotch crypto purpose, currently `sign`,
  `authenticated`, `symmetric`, or `anonymous`.
- **Pair identity**: the canonical combination of `keyId` and `purpose`.
- **Public record**: the record containing the public key and its integrity
  metadata.
- **Secret record**: the record containing the encrypted secret key and its
  integrity metadata.
- **Public seed**: bootstrap material used to protect or authenticate public
  records. It is not a secret in the confidentiality sense.
- **Secret seed**: secret bootstrap material used to encrypt and authenticate
  secret records. It must never be sent to storage or public-only deployments.
  Environment-backed bootstrap configuration may provide this property as an
  empty string; that value means the deployment has no secret seed.
- **Record ID**: a derived storage lookup identifier for one public or secret
  record. It is not itself an integrity check.
- **Pair ID**: a stable identifier binding the public and secret records to the
  same generated pair.

## 5. Key-store deployment-access API

The key-store accepts requests only through an Opscotch
`deploymentAccess` trigger. It must not bind an HTTP listener.

The top-level operation must be one of `get` or `getOrGenerate`. `put`,
overwrite, expected-version updates, and rotation operations are invalid.

### 5.4 Administrative load

Existing key pairs may be imported only through the separately authorized
`key-store-admin-call` deployment-access seam. The ordinary `key-store-call`
contract must not accept or route `load` requests.

Request:

```json
{
  "load": {
    "keyId": "my-app-identity",
    "purpose": "authenticated",
    "keyPair": {
      "publicKeyHex": "<hex-or-null>",
      "secretKeyHex": "<hex>"
    }
  }
}
```

The load operation creates the pair only when the identity is absent. It must
reject an existing identity, verify the persisted records before succeeding,
and return metadata without returning the imported key material. The
`opscotch-key-store-admin-http` adapter exposes this operation over HTTP and
must itself be protected by deployment/network authentication.

### 5.1 Get

Request:

```json
{
  "get": {
    "keyId": "my-app-identity",
    "purpose": "authenticated"
  }
}
```

Private deployment response:

```json
{
  "keyId": "my-app-identity",
  "purpose": "authenticated",
  "pairId": "<opaque-pair-id>",
  "keyPair": {
    "publicKeyHex": "<hex>",
    "secretKeyHex": "<hex>"
  },
  "created": false
}
```

Public-only deployment response:

```json
{
  "keyId": "my-app-identity",
  "purpose": "authenticated",
  "pairId": "<opaque-pair-id>",
  "keyPair": {
    "publicKeyHex": "<hex>"
  },
  "created": false
}
```

Requirements:

- `keyId` and `purpose` are both required and must be validated.
- `get` must never create a pair.
- A missing pair returns a stable not-found error.
- A deployment without the secret seed returns only the public key.
- The key-store must not reveal whether a secret record exists to an
  unauthorized caller.
- The response must not include storage-provider details.

### 5.2 Get or generate

Request:

```json
{
  "getOrGenerate": {
    "keyId": "my-app-identity",
    "purpose": "authenticated"
  }
}
```

Requirements:

- If the pair exists, return it with `created: false`.
- If both records are absent, call the shared
  `generate-key-pair.js` processor with the requested purpose.
- Persist the public and secret records through one atomic pair
  create-if-absent operation.
- Return the generated pair with `created: true` only to the successful
  creator.
- Concurrent callers must converge on the same stored pair. A losing caller
  must return the winning pair with `created: false`.
- A pair that already exists is immutable. A second creation attempt is not an
  overwrite and must not replace either component.
- A public-only deployment may create only if its configured architecture
  explicitly supplies a safe secret-generation/storage path; otherwise it may
  read public records but must reject generation rather than create an
  unusable pair.

### 5.3 Validation and errors

The schema must reject:

- missing or empty `keyId`;
- missing or unsupported `purpose`;
- unknown top-level operations, including `put`;
- extra operation fields;
- malformed key IDs or oversized values.

Stable error categories must include:

- invalid request;
- unauthorized caller;
- key not found;
- pair already exists/conflict;
- incomplete pair;
- malformed record;
- wrong key or purpose;
- integrity/authentication failure;
- unsupported format or derivation version;
- storage unavailable or timeout;
- internal cryptographic failure.

Errors must not expose seeds, derived keys, plaintext key material, or
provider-specific diagnostics.

## 6. Public and secret record model

One storage table contains separate public and secret records. The key-store
derives their IDs from the canonical pair identity and explicit domains:

```text
publicRecordId = H(public-domain || purpose || canonicalKeyId)
secretRecordId = H(secret-domain || purpose || canonicalKeyId)
```

The exact byte encoding, hash/KDF, and version must be documented and stable.
The public and secret IDs must never be interchangeable.

Each record must include authenticated metadata equivalent to:

```json
{
  "format": "opscotch-key-store/key-record/v2",
  "recordType": "public",
  "keyId": "my-app-identity",
  "purpose": "authenticated",
  "pairId": "<opaque-pair-id>",
  "derivation": "v2",
  "domain": "public",
  "payload": "<encoded-key-material>",
  "tag": "<integrity-tag>"
}
```

The secret record uses `recordType: "secret"`, the secret domain, and an
encrypted payload. The public record may contain public key material directly,
but it must still have integrity protection sufficient to detect substitution
or tampering.

## 7. Read integrity requirements

Every `get` and existing-pair `getOrGenerate` path must validate the returned
record before returning any key material. The check must authenticate and
bind:

- requested `keyId`;
- requested `purpose`;
- `recordType` (`public` or `secret`);
- public/secret derivation domain;
- `pairId`;
- format and derivation versions;
- encrypted payload, nonce, and authentication tag where applicable.

A derived storage ID is only a lookup address. It is not sufficient evidence
that the record is correct. The key-store must reject wrong-key, wrong-purpose,
swapped public/secret, mismatched-pair, modified-metadata, and tampered-record
cases before returning material.

If one record is missing, the pair metadata does not match, or one record fails
integrity validation, the operation must return an incomplete/integrity error
and must not return a partial secret response. A public-only deployment may
return a validated public record without loading or decrypting the secret
record.

## 8. Cryptography and seed handling

All cryptographic operations must use documented Opscotch Crypto and Byte
contexts. No undocumented runtime crypto helper or test-only cryptographic
implementation may be substituted.

The secret record must use a derived encryption key and independent
authentication key:

```text
encryptionKey = KDF(secretSeed, "secret-encryption", purpose, keyId)
authenticationKey = KDF(secretSeed, "secret-authentication", purpose, keyId)
```

The public record must use a separate public domain and public seed for its
integrity protection. The public seed must never be used to derive secret
encryption keys.

The construction must have these properties:

- distinct `(keyId, purpose, recordType)` values produce independent derived
  keys or domains;
- the same identity in the same configured domain can be read after restart;
- derived keys are never persisted or returned;
- seed material exists only in bootstrap/configuration available to the
  appropriate deployment;
- sensitive byte buffers are released or zeroed according to the Opscotch
  runtime API;
- key material, seeds, ciphertext, and derived keys do not appear in logs,
  metrics, diagnostics, workflow state, or provider responses.

The secret encryption envelope must use a fresh cryptographically random nonce
for every encryption operation. The authentication tag must cover the record
format, type, pair identity, purpose, domain, derivation version, nonce, and
ciphertext/payload.

## 9. Storage application contract

The storage app persists opaque public and secret records. It must not receive
either seed or perform decryption.

The provider-neutral contract must support:

- `getPair(pairId, publicRecordId, secretRecordId, includeSecret)` — return
  the public record and, when requested by a private key-store deployment, the
  secret record;
- `putPairIfAbsent(publicRecordId, publicRecord, secretRecordId,
  secretRecord)` — atomically create both records or create neither;
- stable conflict, not-found, validation, and unavailable outcomes.

Conditional update, overwrite, and delete are not required for this immutable
release and must not be exposed as key-store operations.

The storage provider must preserve record bytes and metadata exactly. The
key-store must access it only through explicit cross-deployment access and
synchronous workflow calls. Provider-specific behavior must remain within the
storage app.

### 9.1 Local storage provider

`opscotch-key-store-local-storage` must:

- validate public/secret record envelopes without decrypting them;
- persist records using the derived record IDs;
- implement atomic pair creation with crash-safe temporary state and recovery;
- never report success when only one component was committed;
- return deterministic conflict results for duplicate creation;
- test restart durability, malformed records, partial writes, and provider
  failures.

### 9.2 DynamoDB provider

`opscotch-key-store-dynamodb` must:

- use one configured DynamoDB table for both record types;
- store public and secret records as separate items with explicit type/domain
  attributes;
- implement `putPairIfAbsent` with `TransactWriteItems` and
  `attribute_not_exists` conditions for both items;
- map transaction conflicts to the stable pair-conflict result without
  overwriting either item;
- keep table schema/provisioning configuration bound to this implementation;
- call DynamoDB only through the configured `aws-services` deployment;
- test transaction request shape, conflicts, malformed responses, and AWS
  service failures.

## 10. HTTP adapter

`opscotch-key-store-http` owns only the HTTP listener, HTTP request parsing,
authentication boundary, response translation, and cross-deployment call to
the key-store.

It must:

- forward the structured `get` and `getOrGenerate` requests unchanged;
- require `purpose` for both operations;
- never generate keys or perform cryptographic operations itself;
- preserve public-only responses and never synthesize a secret key;
- return HTTP 400 for invalid operations, missing fields, unsupported
  purposes, and immutable update attempts;
- translate not-found, conflict, and unavailable outcomes according to the
  documented HTTP contract;
- never log request bodies containing key material.

## 11. Bootstrap and workflow shape

The key-store workflow must contain no HTTP trigger or HTTP listener. Its
bootstrap must configure:

- public seed and public derivation domain;
- secret seed and secret derivation domain when the deployment is private;
- key-store derivation/record format version;
- storage deployment access ID and storage operation step IDs;
- explicit allowed caller deployments.

The public-only bootstrap must provide an empty secret-seed value when the
bootstrap schema requires the property, and grant only the access needed to
read public records. An empty or whitespace-only secret seed means the
deployment has no secret seed. The private bootstrap may access both records.
Storage bootstraps must contain only provider configuration and must never
contain either key-store seed.

The HTTP bootstrap must wire the HTTP adapter to the key-store through
cross-deployment access. Local-storage and DynamoDB test bootstraps must be
available independently and through the composed HTTP test setup.

## 12. Reliability, concurrency, and observability

- `get` is read-only and safe to retry.
- Pair creation is atomic and safe to retry.
- A timeout after pair creation must be reconciled by reading both records
  before reporting failure where the provider contract permits.
- Concurrent creators must converge on one pair.
- A partial pair must never be returned as a complete private response.
- Restarts must not change record IDs or derived keys for the same bootstrap
  domains and versions.

Emit only safe metrics for request counts, not-found results, pair creation,
conflicts, retries, latency, provider failures, authorization failures, and
integrity failures. Metrics and diagnostics must use redacted or hashed IDs
where necessary and must never contain raw request bodies or key material.

## 13. Testing and acceptance criteria

Unit and integration tests must cover:

- required `keyId` and `purpose` validation;
- rejection of `put`, overwrite, update, and rotation requests;
- generation through the shared key-pair processor;
- first pair creation and repeated lookup;
- concurrent pair creation converging on one pair;
- public-only lookup without a secret seed;
- inability of a public-only deployment to return a secret key;
- wrong key, wrong purpose, wrong record type, wrong domain, wrong pair ID,
  modified metadata, modified nonce, modified ciphertext, and modified tag;
- missing public or secret component and mismatched pair metadata;
- local provider crash/restart and malformed-record behavior;
- DynamoDB transactional write conditions and conflict behavior;
- provider replacement without key-store contract changes;
- HTTP 400 responses for invalid operations and malformed requests;
- missing or invalid bootstrap seed behavior;
- absence of secrets from logs, metrics, diagnostics, and errors.

The first release is accepted when all four apps have updated workflows,
bootstraps, documentation, fixtures, and tests; the key-store remains
deployment-access-only; local storage and DynamoDB both implement the same
immutable pair contract; and no migration or old-record compatibility path has
been added.
