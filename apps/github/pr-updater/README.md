# GitHub PR Updater

Reusable Opscotch app for pull-request mutation operations through deployment-access calls.

## Callable step IDs

- `github-pr-create` (`operation` fixed to `create-pr`)
- `github-pr-update` (`operation` fixed to `update-pr`)
- `github-pr-request-reviewers` (`operation` fixed to `request-reviewers`)

## Public input contract

Call purpose by step:
- `github-pr-create`: creates a pull request in the target repository.
- `github-pr-update`: updates mutable pull request fields (for example title/body/base/state/draft).
- `github-pr-request-reviewers`: requests reviewers on an existing pull request.

The following schema is the public contract callers must satisfy for all callable step IDs above.

```json
{
  "type": "object",
  "required": ["repo", "issue"],
  "additionalProperties": true,
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number context." },
    "head": { "type": "string", "description": "Used by create-pr." },
    "pull_number": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Required for update-pr/request-reviewers." }
  }
}
```

Operation-specific fields (`title`, `base`, `body`, `draft`, `reviewers`) are validated at runtime for each operation.

## Bootstrap usage example

```json
[
  {
    "deploymentId": "github-pr-updater",
    "remoteConfiguration": "workflow.json",
    "frequency": 0,
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
          { "method": "GET", "uriPattern": "/repos/.+/pulls.*" },
          { "method": "POST", "uriPattern": "/repos/.+/pulls$" },
          { "method": "PATCH", "uriPattern": "/repos/.+/pulls/.+" },
          { "method": "POST", "uriPattern": "/repos/.+/pulls/.+/requested_reviewers" }
        ]
      }
    ],
    "allowDeploymentAccess": [
      { "id": "github-issue-updater-callers-pr", "deploymentId": "REPLACE_PR_ACTIONS_DEPLOYMENT_ID", "access": "receive" },
      { "id": "github-pr-updater-callers", "deploymentId": "REPLACE_CALLER_DEPLOYMENT_ID", "access": "receive" }
    ],
    "data": {
      "githubAuthHostId": "github-api-auth",
      "hostId": "github-api"
    }
  }
]
```

## Notes

- `github-issue-updater-callers-pr` is included for compatibility with combined issue/PR action deployments.
- Access errors usually indicate caller `allowDeploymentAccess` does not match the receiver id used for the step.
