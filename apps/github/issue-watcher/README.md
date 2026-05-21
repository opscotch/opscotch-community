# GitHub Issue Watcher

Reusable Opscotch app that polls GitHub issues and routes matched issues to downstream deployment steps.

## What this app does

- Polls open issues for one repo/assignee pair at a time.
- Filters/routs by label using `githubIssueWatcherCriteria`.
- Calls `deploymentId` + `stepId` from the matched criterion.

## Bootstrap usage example

```json
[
  {
    "deploymentId": "github-issue-watcher",
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
          { "method": "GET", "uriPattern": "/repos/.+/issues.*" },
          { "method": "GET", "uriPattern": "/repos/.+/issues/.+/comments.*" }
        ]
      }
    ],
    "data": {
      "githubAuthHostId": "github-api-auth",
      "hostId": "github-api",
      "issueHandoffDelaySeconds": 120,
      "githubIssueWatcherCriteria": [
        {
          "label": "triage",
          "assignee": "YOUR_GITHUB_USERNAME",
          "repo": "YOUR_ORG/YOUR_REPO",
          "deploymentId": "target-deployment-access-id",
          "stepId": "target-step-id"
        }
      ]
    }
  }
]
```

## Data contract

- `hostId` (string, optional): GitHub API host id, defaults to `github-api`.
- `issueHandoffDelaySeconds` (number, optional): minimum issue age by `updated_at` before handoff.
- `issueWatcherDecisionLoggingEnabled` (boolean, optional): emits diagnostic matching logs.
- `githubIssueWatcherCriteria` (array, required): routing criteria.

Each `githubIssueWatcherCriteria[]` item requires:
- `label` (string)
- `assignee` (string)
- `repo` (string, `owner/repo`)
- `deploymentId` (string)
- `stepId` (string)

## Important nuance

- All criteria in a single deployment must share the same `repo` and `assignee` because polling is done with one upstream query and label selection happens in the results processor.
- This app routes only; it does not mutate GitHub issues.
