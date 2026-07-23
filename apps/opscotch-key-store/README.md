# opscotch-key-store

The key-store exposes secret operations through Opscotch deployment access.
The deployment intentionally has no HTTP trigger, HTTP listener, or public endpoint.

## Topology

```text
authorized service
        │ deployment access: key-store-call
        ▼
opscotch-key-store
        │ deployment access: storage-call
        ▼
opscotch-key-store-storage
```

The key-store owns request validation, key generation, derivation, encryption,
integrity checks, decryption, and response shaping. The storage app owns
persistence only and receives opaque public/secret records.

## Calling the API

The operation is the top-level property name:

```json
{"get":{"keyId":"service/example","purpose":"sign"}}
```

```json
{"getOrGenerate":{"keyId":"service/example","purpose":"sign"}}
```

`get` returns an existing immutable pair and does not create records.
`getOrGenerate` requires a crypto `purpose` and delegates key-pair generation
to Opscotch's shared `generate-key-pair.js` processor. It returns the generated
or existing key pair and includes `created` so callers can distinguish those
cases.

Administrative imports use a separate `key-store-admin-call` deployment-access
seam and the `opscotch-key-store-admin-http` adapter. A load request creates an
absent identity once, rejects existing identities, verifies the persisted
records, and returns metadata without returning the imported key material.

Successful responses have this general shape:

```json
{"keyId":"service/example","purpose":"sign","keyPair":{"publicKeyHex":"<hex>","secretKeyHex":"<hex>"},"created":false,"version":1}
```

Errors are safe, stable outcomes. Callers should handle not-found, conflict,
invalid-record/integrity, and storage-unavailable outcomes without relying on
provider-specific messages.

## Bootstrap responsibilities

Key-store bootstrap data supplies:

- `publicKeyStoreSeedHex` and `publicKeyStoreDomain`: public-record integrity
  domain.
- `secretKeyStoreSeedHex` and `secretKeyStoreDomain`: private-record encryption
  domain. Public-only deployments provide an empty secret seed when the
  bootstrap property is required.
- `derivationVersion`: derivation and record format version.
- `storageDeploymentAccessId` and `storageStepId`: storage call route.
- The shared key-pair processor controls supported crypto purposes.

The `key-store-call` permitter controls inbound callers. The `storage-call`
permitter is outbound access to the storage deployment. These permissions are
bootstrap-controlled and are not caller-supplied request fields.

## Cryptography

Each `(keyId, purpose)` identity gets distinct public and secret record IDs.
Secret records use independent encryption and authentication keys derived from
the secret seed, domain, purpose, and canonical key ID. Secret material is
encrypted with XSalsa20 using a fresh 24-byte nonce. Public and secret record
tags authenticate the record type, identity, pair ID, domain, version, and
payload.

## HTTP adapters

The normal HTTP adapter is a separate deployment. It owns HTTP authentication,
parsing, status mapping, and listener permissions, then calls this app through
`key-store-call`. It must not copy key derivation, encryption,
storage-provider, or seed-handling logic.

The administrative HTTP adapter exposes `POST /admin/key-store/load` through a
separate deployment-access permitter. It must be independently authenticated
and authorized; the core key-store does not expose an HTTP listener.
