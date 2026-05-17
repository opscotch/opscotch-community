# OpenClaw Agent Invoker

Reusable Opscotch app for calling the local OpenClaw gateway endpoint.

## Step

- `invoke-openclaw-agent`

## Input payload

Generic shape:

```json
{
  "agent": "main",
  "input": {
    "repo": "opscotch/hopscotch",
    "issue": 317
  },
  "metadata": {
    "operation": "refine"
  }
}
```

## Data properties

- `openclawGatewayHostId` (required)

## Bootstrap requirements

- Configure `allowExternalHostAccess` for the local gateway host.
- Configure `allowDeploymentAccess` receive id `openclaw-agent-invoker-callers`.
