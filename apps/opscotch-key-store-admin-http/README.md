# opscotch-key-store-admin-http

Administrative HTTP adapter for importing existing immutable key pairs.

## Endpoint

`POST /admin/key-store/load` on the `api` HTTP server:

```json
{
  "load": {
    "keyId": "my-app-identity",
    "purpose": "sign",
    "keyPair": {
      "publicKeyHex": "...",
      "secretKeyHex": "..."
    }
  }
}
```

The endpoint returns `201` when the pair is loaded and `409` when the identity
already exists. Existing keys cannot be updated or rotated. The response never
contains the imported secret key.

This app must be separately authenticated and authorized. The core key-store
deployment receives requests through the `key-store-admin-call` deployment
access permitter.
