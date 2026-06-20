# GitHub Issue Watcher

Reusable Opscotch app that polls GitHub issues and routes matched issues to downstream deployment steps.

## What this app does

- Polls open issues for each configured repo/assignee group.
- Filters/routes by label using `githubIssueWatcherRepos`.
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
      "githubIssueWatcherRepos": [
        {
          "assignee": "YOUR_GITHUB_USERNAME",
          "repo": "YOUR_ORG/YOUR_REPO",
          "criteria": [
            {
              "label": "triage",
              "deploymentId": "target-deployment-access-id",
              "stepId": "target-step-id"
            }
          ]
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
- `githubIssueWatcherRepos` (array, required): repo/assignee polling groups.

Each `githubIssueWatcherRepos[]` item requires:
- `assignee` (string)
- `repo` (string, `owner/repo`)
- `criteria` (array)

Each `criteria[]` item requires:
- `label` (string)
- `deploymentId` (string)
- `stepId` (string)

## Important nuance

- Each repo group is polled separately, so one watcher deployment can cover multiple repositories.
- This app routes only; it does not mutate GitHub issues.
