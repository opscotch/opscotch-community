# GitHub Action Runner

Reusable Opscotch app for triggering GitHub Actions workflows and querying run/job/log state.

## Callable step IDs

- `github-action-list-runs`
- `github-action-get-run`
- `github-action-get-failing-step`
- `github-action-get-job-logs`
- `github-action-trigger`
- `github-action-get-step-logs`
- `github-action-get-failing-step-logs`

## Public input contracts

### `github-action-list-runs`, `github-action-get-run`, `github-action-get-failing-step`, `github-action-get-job-logs`

Use these calls to read GitHub Actions run state:
- `github-action-list-runs`: lists workflow runs for a workflow in a repository.
- `github-action-get-run`: fetches one workflow run's current status and conclusion.
- `github-action-get-failing-step`: finds failing job/step metadata for a run.
- `github-action-get-job-logs`: resolves the GitHub logs redirect URL for a job.

```json
{
  "type": "object",
  "required": ["repo"],
  "properties": {
    "repo": { "type": "string", "description": "Owner/repo format." },
    "workflow_id": { "type": "string", "description": "Required for list-runs calls." },
    "run_id": { "type": "number", "description": "Required for get-run and get-failing-step calls." },
    "job_id": { "type": "number", "description": "Required for get-job-logs calls." },
    "ref": { "type": "string", "description": "Branch or tag to trigger (used by trigger calls)." },
    "branch": { "type": "string", "description": "Optional branch filter for workflow runs." },
    "per_page": { "type": "number", "description": "Optional results-per-page value." },
    "event": { "type": "string", "enum": ["workflow_dispatch", "schedule"], "description": "Optional event filter for workflow runs." }
  }
}
```

The required subset depends on the operation:
- list runs: `repo`, `workflow_id`
- get run: `repo`, `run_id`
- get failing step: `repo`, `run_id`
- get job logs: `repo`, `job_id`

### `github-action-trigger`

Use this call to dispatch a workflow and resolve the newly created run id by polling runs.

```json
{
  "type": "object",
  "required": ["repo", "workflow_id", "ref"],
  "properties": {
    "repo": { "type": "string", "description": "Owner/repo format." },
    "workflow_id": { "type": "string", "description": "Workflow file name or workflow id." },
    "ref": { "type": "string", "description": "Branch or tag to trigger." },
    "branch": { "type": "string", "description": "Optional branch filter used while resolving the new run." },
    "event": { "type": "string", "enum": ["workflow_dispatch", "schedule"], "description": "Optional event filter." },
    "per_page": { "type": "number", "description": "Optional run page size." },
    "max_polls": { "type": "number", "description": "Optional maximum poll count while resolving a new run." },
    "inputs": { "type": "object", "description": "Optional workflow dispatch inputs." }
  }
}
```

### `github-action-get-step-logs`

Use this call to fetch and slice logs for a specific step window in a run/job.

```json
{
  "type": "object",
  "required": [
    "repo",
    "run_id",
    "job_id",
    "step_name",
    "step_started_at",
    "step_completed_at",
    "log_fetch_deployment_access_id",
    "log_fetch_step_id"
  ],
  "properties": {
    "repo": { "type": "string", "description": "Owner/repo format." },
    "run_id": { "type": "number", "description": "Workflow run id." },
    "job_id": { "type": "number", "description": "Workflow job id." },
    "step_name": { "type": "string", "description": "GitHub step name." },
    "step_number": { "type": "number", "description": "Optional GitHub step number." },
    "step_started_at": { "type": "string", "description": "Step start timestamp (ISO8601)." },
    "step_completed_at": { "type": "string", "description": "Step completion timestamp (ISO8601)." },
    "log_fetch_deployment_access_id": { "type": "string", "description": "Deployment access id for external log-fetch step." },
    "log_fetch_step_id": { "type": "string", "description": "Step id for external log-fetch step." }
  }
}
```

### `github-action-get-failing-step-logs`

Use this call to resolve the failing step for a run and return parsed log lines for that failing step.

```json
{
  "type": "object",
  "required": ["repo", "run_id", "log_fetch_deployment_access_id", "log_fetch_step_id"],
  "properties": {
    "repo": { "type": "string", "description": "Owner/repo format." },
    "run_id": { "type": "number", "description": "Workflow run id." },
    "log_fetch_deployment_access_id": { "type": "string", "description": "Deployment access id for external log-fetch step." },
    "log_fetch_step_id": { "type": "string", "description": "Step id for external log-fetch step." }
  }
}
```

## Bootstrap usage example

```json
[
  {
    "deploymentId": "github-action-runner",
    "remoteConfiguration": "workflow.json",
    "allowExternalHostAccess": [
      {
        "id": "github-api-auth",
        "host": "https://api.github.com",
        "authenticationHost": true,
        "data": {
          "githubToken": "REPLACE_ME_WITH_GH_TOKEN"
        }
      },
      {
        "id": "github-api",
        "host": "https://api.github.com",
        "httpTimeout": 15000,
        "allowList": [
          { "method": "POST", "uriPattern": "/repos/.+/actions/workflows/.+/dispatches" },
          { "method": "GET", "uriPattern": "/repos/.+/actions/workflows/.+/runs.*" },
          { "method": "GET", "uriPattern": "/repos/.+/actions/runs/.+" },
          { "method": "GET", "uriPattern": "/repos/.+/actions/runs/.+/jobs.*" },
          { "method": "GET", "uriPattern": "/repos/.+/actions/jobs/.+/logs" }
        ]
      }
    ],
    "allowDeploymentAccess": [
      { "id": "github-action-runner-callers", "deploymentId": "REPLACE_CALLER_DEPLOYMENT_ID", "access": "receive" },
      { "id": "REPLACE_NOTIFICATION_TARGET_ACCESS_ID", "deploymentId": "REPLACE_NOTIFICATION_TARGET_DEPLOYMENT_ID", "access": "call" }
    ],
    "data": {
      "hostId": "github-api",
      "githubAuthHostId": "github-api-auth"
    }
  }
]
```

## Notes

- `github-action-get-step-logs` and `github-action-get-failing-step-logs` require a caller-provided log-fetch step because GitHub log downloads redirect to dynamic hosts.
- The optional `call` deployment access entry is used when this app forwards run-state events to another deployment.
