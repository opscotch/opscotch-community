# MCP Framework

Reusable Opscotch MCP deployment that exposes a minimal Streamable HTTP-compatible MCP endpoint and accepts cross-deployment registration from sibling deployments in the same agent.

## Properties

- Stateless over restart and config reload
- Registry is held only in runtime memory via `context.getStepProperties()`
- Sibling deployments rebuild registry state by re-registering with `runOnce` or by explicit composite orchestration
- Supports `initialize`, `ping`, `notifications/initialized`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`
- Implements a minimal MCP Streamable HTTP surface for `POST /mcp` and `GET /mcp`
- Optional `data.debug_log` flag enables request body logging for MCP HTTP entry steps

## Debug Logging

Set deployment `data.debug_log` to `true` to enable the framework's `log(...)` wrapper around request-body `console.log` output. When unset or false, those logs stay silent.

## Included Files

- `bootstrap.json`: single deployment record for embedding into a larger bootstrap array
- `example.bootstrap.json`: runnable sample with the framework plus a sibling app
- `example.config.json`: sample sibling app that registers on startup
- `workflow.json`: MCP endpoint, registration route, method handlers, and in-memory registry owner step
- `resources/apps/mcp-framework/*.js`: routing, registry, and MCP handler scripts

## Embedding Pattern

Include the framework deployment alongside one or more business deployments in the same bootstrap array.

The framework deployment should start earlier than sibling deployments using `startupPriority`.

Each business deployment should:

1. Add an `allowDeploymentAccess` entry with `access: "call"` to deployment `mcp-framework`
2. Add a `runOnce` step that sends its registration payload to framework step `register`, or expose a registration step that a composite orchestrator can call explicitly
3. Expose any dynamic tool, resource, or prompt handler steps referenced in the registration payload

The framework deployment must also be extended with `allowDeploymentAccess` entries with `access: "call"` for every callback target it must invoke. The generic `bootstrap.json` in this app only includes the open registration receive rule because callback targets are consumer-specific.

## Registration Payload

```json
{
  "namespace": "example",
  "replace": true,
  "tools": [
    {
      "name": "echo",
      "title": "Echo",
      "description": "Returns the supplied string",
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": { "type": "string" }
        }
      },
      "handler": {
        "deploymentAccessId": "example-callback",
        "stepId": "mcp-tool-echo"
      }
    }
  ],
  "resources": [
    {
      "uri": "example://about",
      "name": "About",
      "description": "Static about content",
      "mimeType": "text/plain",
      "source": {
        "type": "static",
        "text": "Example app"
      }
    }
  ],
  "prompts": [
    {
      "name": "summarize",
      "title": "Summarize",
      "description": "Simple prompt",
      "source": {
        "type": "static",
        "text": "Summarize the following text."
      }
    }
  ]
}
```

Normalization rules:

- tools become `namespace.name`
- prompts become `namespace.name`
- resource URIs must already be globally unique
- duplicate namespace registration requires `replace: true`

## Example Caller Registration Step

```json
{
  "stepId": "register-mcp",
  "trigger": {
    "runOnce": true
  },
  "resultsProcessor": {
    "script": "context.sendToStep(\"mcp-framework\", \"register\", JSON.stringify({ namespace: \"example\", replace: true, tools: [{ name: \"echo\", title: \"Echo\", description: \"Returns the supplied string\", inputSchema: { type: \"object\", properties: { text: { type: \"string\" } } }, handler: { deploymentAccessId: \"example-callback\", stepId: \"mcp-tool-echo\" } }], resources: [{ uri: \"example://about\", name: \"About\", description: \"Static about content\", mimeType: \"text/plain\", source: { type: \"static\", text: \"Example app\" } }], prompts: [{ name: \"summarize\", title: \"Summarize\", description: \"Simple prompt\", source: { type: \"static\", text: \"Summarize the following text.\" } }] }));"
  }
}
```

## HTTP Endpoint

- `POST /mcp`
- `GET /mcp`
- `POST /mcp` accepts single JSON-RPC requests, notifications including `notifications/initialized`, response envelopes, and non-empty batches
- `POST /mcp` supports `ping` and returns an empty MCP result object
- Notification-only and response-only `POST` payloads return `200 OK` with no body
- `GET /mcp` returns `200 OK` with a small JSON warm-up payload and does not require an MCP request body
- Responses are returned as `application/json`; `text/event-stream` is not implemented in this minimal version
- The framework validates `Origin` and only allows loopback browser origins (`localhost`, `127.0.0.1`, `[::1]`) or no `Origin` header
- The advertised MCP protocol version is `2025-03-26`

## Sample App

Use `example.bootstrap.json` to run the framework with a sibling sample deployment.

What the sample registers:

- tool: `sample.echo`
- resource: `sample://about`
- prompt: `sample.summarize`

The sample tool callback is implemented in `resources/apps/mcp-framework/example-echo.js`.

Example requests:

```bash
curl -sS http://127.0.0.1:39590/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

```bash
curl -sS http://127.0.0.1:39590/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sample.echo","arguments":{"text":"hello"}}}'
```
