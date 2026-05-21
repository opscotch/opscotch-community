# GitHub Issue Updater

Reusable Opscotch app for mutating GitHub issues and pull requests through deployment-access calls.

## Callable step IDs

- `github-issue-updater` (`operation` must be provided in payload)
- `github-issue-add-comment` (`operation` fixed to `add-comment`)
- `github-issue-update` (`operation` fixed to `update-issue`)
- `github-issue-delete-comment` (`operation` fixed to `delete-comment`)
- `github-pr-create` (`operation` fixed to `create-pr`)
- `github-pr-update` (`operation` fixed to `update-pr`)
- `github-pr-request-reviewers` (`operation` fixed to `request-reviewers`)

## Public input contract

Call purpose by step:
- `github-issue-updater`: generic issue/PR mutation entrypoint where `operation` in the payload selects the behavior.
- `github-issue-add-comment`: adds a comment to an issue.
- `github-issue-update`: updates mutable issue fields (for example title/body/state/labels/assignees/milestone).
- `github-issue-delete-comment`: deletes an issue comment by id.
- `github-pr-create`: creates a pull request.
- `github-pr-update`: updates mutable pull request fields.
- `github-pr-request-reviewers`: requests reviewers on a pull request.

The following schema is the public contract callers must satisfy for all callable step IDs above.

```json
{
  "type": "object",
  "required": ["repo", "issue"],
  "additionalProperties": true,
  "properties": {
    "operation": { "type": "string", "description": "Required when calling github-issue-updater directly." },
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number." },
    "label": { "type": "string", "description": "Required for remove-label." },
    "comment_id": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Required for delete-comment." },
    "head": { "type": "string", "description": "Used by get-open-pr-by-head and create-pr." },
    "pull_number": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Required for update-pr/request-reviewers." }
  }
}
```

Operation-specific fields (for example `comment`, `title`, `base`, `reviewers`) are validated at runtime based on the selected operation.

## Bootstrap usage example

```json
[
  {
    "deploymentId": "github-issue-updater",
    "remoteConfiguration": "/community/opscotch-community/apps/github/issue-updater/workflow.json",
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
          { "method": "PATCH", "uriPattern": "/repos/.+/issues/.+" },
          { "method": "POST", "uriPattern": "/repos/.+/issues/.+/(labels|assignees|comments)" },
          { "method": "PUT", "uriPattern": "/repos/.+/issues/.+/labels" },
          { "method": "DELETE", "uriPattern": "/repos/.+/issues/.+/(labels/.+|assignees)" },
          { "method": "DELETE", "uriPattern": "/repos/.+/issues/comments/.+" },
          { "method": "GET", "uriPattern": "/repos/.+/pulls.*" },
          { "method": "POST", "uriPattern": "/repos/.+/pulls$" },
          { "method": "PATCH", "uriPattern": "/repos/.+/pulls/.+" },
          { "method": "POST", "uriPattern": "/repos/.+/pulls/.+/requested_reviewers" },
          { "method": "POST", "uriPattern": "/repos/.+/actions/workflows/.+/dispatches" },
          { "method": "GET", "uriPattern": "/repos/.+/actions/workflows.*" },
          { "method": "GET", "uriPattern": "/repos/.+/contents/.+" }
        ]
      }
    ],
    "allowDeploymentAccess": [
      { "id": "github-issue-updater", "deploymentId": "REPLACE_ISSUE_WATCHER_DEPLOYMENT_ID", "access": "receive" },
      { "id": "github-issue-updater-callers", "deploymentId": "REPLACE_TICKET_ACTIONS_DEPLOYMENT_ID", "access": "receive" }
    ],
    "data": {
      "githubAuthHostId": "github-api-auth",
      "hostId": "github-api"
    }
  }
]
```

## Notes

- This app is callable only through deployment access; it is not timer-driven.
- `github-pr-updater` can be deployed separately if you want PR-only surface area.
- Access errors usually indicate caller `allowDeploymentAccess` does not match the receiver id used for the step.
