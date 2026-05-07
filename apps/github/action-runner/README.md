# GitHub Action Runner

Reusable Opscotch app for triggering GitHub Actions workflows and polling for completion.

## Steps

- `github-action-trigger`
- `github-action-list-runs`
- `github-action-get-run`

## Input payloads

Trigger a workflow dispatch:

```json
{
  "operation": "trigger-workflow",
  "repo": "owner/repo",
  "workflow_id": "ci.yml",
  "ref": "main",
  "inputs": {
    "ticket": "317"
  }
}
```

List workflow runs:

```json
{
  "operation": "list-workflow-runs",
  "repo": "owner/repo",
  "workflow_id": "ci.yml",
  "branch": "main",
  "event": "workflow_dispatch",
  "per_page": 20
}
```

Get one run (watch completion):

```json
{
  "operation": "get-workflow-run",
  "repo": "owner/repo",
  "run_id": 123456789
}
```

For `get-workflow-run`, response includes:

- `completed` (`true` when status is `completed`)
- `success` (`true` when conclusion is `success`)
- `run_status`
- `run_conclusion`

## Bootstrap requirements

- Configure `allowExternalHostAccess` host `github-api` with restricted token data.
- Configure `allowDeploymentAccess` receive id `github-action-runner-callers`.
