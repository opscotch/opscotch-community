# opscotch-key-store-http

HTTP adapter for the deployment-access-only `opscotch-key-store` app.

## Endpoint

`POST /key-store` on the `api` HTTP server.

The request body is forwarded unchanged to the key-store deployment's
`accept-key-store` step. The response body is returned unchanged. The
key-store app remains responsible for request validation and all secret
operations:

```json
{"get":{"keyId":"example","purpose":"sign"}}
```

```json
{"getOrGenerate":{"keyId":"example","purpose":"sign"}}
```

## Permissions

`bootstrap.json` grants this deployment:

- HTTP server access through `api` on port `39577`, bound to loopback by default.
- Outbound deployment access through `key-store-call` to
  `opscotch-key-store`.

Invalid operations, missing fields, and unsupported purposes are client errors
(HTTP 400). The key-store deployment must be running with its inbound
`key-store-call` deployment-access permission enabled. The HTTP adapter does
not contain storage or cryptographic logic.
