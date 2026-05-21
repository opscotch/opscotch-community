# GitHub PR Watcher

Reusable Opscotch app that polls GitHub pull requests (via the issues API) and routes matched PRs to downstream deployment steps.

## What this app does

- Polls open PRs for one repo/assignee pair at a time.
- Filters/routes by label using `githubPrWatcherCriteria`.
- Calls `deploymentId` + `stepId` from the matched criterion.

## Bootstrap usage example

```json
[
  {
    "deploymentId": "github-pr-watcher",
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
          { "method": "GET", "uriPattern": "/search/issues.*" },
          { "method": "GET", "uriPattern": "/repos/.+/issues.*" },
          { "method": "GET", "uriPattern": "/repos/.+/issues/.+/comments.*" },
          { "method": "GET", "uriPattern": "/repos/.+/pulls/.+" }
        ]
      }
    ],
    "data": {
      "githubAuthHostId": "github-api-auth",
      "hostId": "github-api",
      "watchEntity": "pr",
      "issueHandoffDelaySeconds": 120,
      "githubPrWatcherCriteria": [
        {
          "label": "ready for dev",
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
- `watchEntity` (string, required): must be `pr`.
- `issueHandoffDelaySeconds` (number, optional): minimum PR age by `updated_at` before handoff.
- `issueWatcherDecisionLoggingEnabled` (boolean, optional): emits diagnostic matching logs.
- `githubPrWatcherCriteria` (array, required): routing criteria.

Each `githubPrWatcherCriteria[]` item requires:
- `label` (string)
- `assignee` (string)
- `repo` (string, `owner/repo`)
- `deploymentId` (string)
- `stepId` (string)

## Important nuance

- All criteria in a single deployment must share the same `repo` and `assignee` because polling is done with one upstream query and label selection happens in the results processor.
- This app routes only; it does not mutate pull requests.
