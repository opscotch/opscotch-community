# GitHub Action Runner

Reusable Opscotch app for triggering GitHub Actions workflows and polling for completion.

The app allows for the registering of GitHub Action run outcome critera matching for dispatch to a specified deploymentId and stepId.

## Prerequsites

This app requires a provisioned GitHub token with sufficient priviledges to perform the listed tasks.

## Steps

- `github-action-trigger`
- `github-action-list-runs`
- `github-action-get-run`
- `github-action-get-failing-step`
- `github-action-watch-runs` (timer-driven watcher)

## Input payloads

Trigger and resolve run id (pre-list, dispatch, poll until new run appears):

```json
{
  "operation": "trigger-and-resolve-workflow-run",
  "repo": "owner/repo",
  "workflow_id": "ci.yml",
  "ref": "main",
  "branch": "main",
  "event": "workflow_dispatch",
  "per_page": 20,
  "max_polls": 15,
  "inputs": {
    "ticket": "317"
  }
}
```

Response includes:

- `run_id`
- `run_status`
- `run_conclusion`
- `html_url`
- `polls_used`

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

Get failing step from a run:

```json
{
  "operation": "get-failing-step",
  "repo": "owner/repo",
  "run_id": 123456789
}
```

Response includes:

- `job_id`
- `job_name`
- `failing_step_name`
- `failing_step_number`
- `all_steps`

## Watcher criteria

`github-action-watch-runs` reads `data.githubActionWatcherCriteria` from bootstrap and routes matching run state changes to target deployment steps.

Example:

```json
{
  "githubActionWatcherCriteria": [
    {
      "repo": "opscotch/builder",
      "workflow_id": "multistage-build.yml",
      "state": "completed",
      "branch": "main",
      "event": "workflow_dispatch",
      "deploymentId": "openclaw-pr-actions-build-state",
      "stepId": "handle-builder-run-state-change",
      "per_page": 20
    }
  ]
}
```

State matching:

- `state` can match run `status` or run `conclusion` (case-insensitive).
- You can force one dimension with:
  - `status:<value>` (for example `status:completed`)
  - `conclusion:<value>` (for example `conclusion:failure`)

## Bootstrap requirements

- Configure `allowExternalHostAccess` host `github-api` with restricted token data.
- Configure `allowDeploymentAccess` receive id `github-action-runner-callers`.
- Configure `allowDeploymentAccess` `call` entries for any watcher notification targets referenced by `deploymentId` in watcher criteria.
