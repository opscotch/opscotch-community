# Release Notes

## opscotch-github-issue-updater v1.x

### Overview

Public app package for the reusable GitHub Issue Updater workflow.

### Included workflow

- `opscotch-community/apps/github/issue-updater/workflow.json`

### Supported operations

- `update-issue`
- `add-comment`
- `delete-comment`
- `create-pr`
- `update-pr`
- `request-reviewers`

### Bootstrap usage example

```json
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
        "githubToken": "REPLACE_ME"
      }
    },
    {
      "id": "github-api",
      "host": "https://api.github.com",
      "httpTimeout": 15000,
      "allowList": [
        {
          "method": "PATCH",
          "uriPattern": "/repos/.+/issues/.+"
        },
        {
          "method": "POST",
          "uriPattern": "/repos/.+/issues/.+/(labels|assignees|comments)"
        },
        {
          "method": "PUT",
          "uriPattern": "/repos/.+/issues/.+/labels"
        },
        {
          "method": "DELETE",
          "uriPattern": "/repos/.+/issues/.+/(labels/.+|assignees)"
        },
        {
          "method": "DELETE",
          "uriPattern": "/repos/.+/issues/comments/.+"
        },
        {
          "method": "GET",
          "uriPattern": "/repos/.+/pulls.*"
        },
        {
          "method": "POST",
          "uriPattern": "/repos/.+/pulls$"
        },
        {
          "method": "PATCH",
          "uriPattern": "/repos/.+/pulls/.+"
        },
        {
          "method": "POST",
          "uriPattern": "/repos/.+/pulls/.+/requested_reviewers"
        },
        {
          "method": "POST",
          "uriPattern": "/repos/.+/actions/workflows/.+/dispatches"
        },
        {
          "method": "GET",
          "uriPattern": "/repos/.+/actions/workflows.*"
        },
        {
          "method": "GET",
          "uriPattern": "/repos/.+/contents/.+"
        }
      ]
    }
  ],
  "allowDeploymentAccess": [
    {
      "id": "github-issue-updater",
      "deploymentId": "REPLACE_ISSUE_WATCHER_DEPLOYMENT_ID",
      "access": "receive"
    },
    {
      "id": "github-issue-updater-callers",
      "deploymentId": "REPLACE_TICKET_ACTIONS_DEPLOYMENT_ID",
      "access": "receive"
    },
    {
      "id": "github-issue-updater-callers-pr",
      "deploymentId": "REPLACE_PR_ACTIONS_DEPLOYMENT_ID",
      "access": "receive"
    }
  ],
  "data": {
    "githubAuthHostId": "github-api-auth",
    "hostId": "github-api"
  }
}
```

### Cross-deployment calls

This app is designed to be called from other deployments using deployment-access IDs.

Receiver-side requirements (issue-updater workflow):
- `defaultStepProperties.trigger.deploymentAccess.ids` includes:
  - `github-issue-updater-callers`
  - `github-issue-updater-callers-pr`
- Steps exposed for cross-deployment calls:
  - `github-issue-updater`
  - `github-issue-add-comment`
  - `github-issue-update`
  - `github-issue-delete-comment`
  - `github-pr-create`
  - `github-pr-update`
  - `github-pr-request-reviewers`

Caller-side requirements (bootstrap):
- `allowDeploymentAccess` must include an entry where:
  - `id` matches one of the receiver deployment access IDs above
  - `deploymentId` points at the `github-issue-updater` deployment
  - `access` is `call`

Example caller pattern from implementation artifacts:
- In `github-ticket-poller` resources, cross-deployment calls are made using:
  - `context.sendToStep(data.issueUpdaterDeploymentAccessId, data.issueUpdaterStepId, JSON.stringify(payload))`
- Real examples:
  - `dispatch-run-build.js` uses `issueUpdaterDeploymentAccessId` and `issueUpdaterStepId`.
  - `dispatch-bmad-pr-develop.js` uses the same pattern for PR update flows.
  - `dispatch-bmad-refine.js` calls step-specific updater steps (for example add-comment/update/delete-comment) via the same deployment access id.

Per-step call schemas (derived from updater step trigger + URL/payload processor `inSchema`):

Common fields used by updater steps:
- `repo` (required): GitHub repository in `owner/repo` format. Example: `opscotch/hopscotch`.
- `issue` (required): Issue number associated with the workflow context. Number or numeric string.
- `operation` (sometimes required): Action to perform when using generic updater step.
- `title`: New issue or PR title.
- `body`: New issue or PR body text.
- `state`: State transition value (`open` or `closed` where applicable).
- `labels`: Label list for label operations.
- `assignees`: Assignee list for assignee operations.
- `milestone`: Numeric milestone id for issue updates.
- `comment`: Comment text for add-comment.
- `comment_id`: GitHub issue comment id for delete-comment.
- `head`: Head branch name for PR creation/search.
- `base`: Base branch name for PR creation/update.
- `pull_number`: Pull request number for PR update/reviewer operations.
- `draft`: Draft flag for PR create/update.
- `reviewers`: Reviewer usernames for PR reviewer requests.

`github-issue-updater` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "operation"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number." },
    "operation": {
      "type": "string",
      "enum": [
        "update-issue",
        "add-comment",
        "delete-comment",
        "create-pr",
        "update-pr",
        "request-reviewers"
      ],
      "description": "Operation executed by this step."
    },
    "title": { "type": "string", "description": "Issue/PR title for update/create operations." },
    "body": { "type": "string", "description": "Issue/PR body text." },
    "state": { "type": "string", "description": "Issue/PR state when supported by operation." },
    "labels": { "type": "array", "items": { "type": "string" }, "description": "Label list for issue update operations." },
    "assignees": { "type": "array", "items": { "type": "string" }, "description": "Assignee list for issue update operations." },
    "milestone": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Milestone id for issue updates." },
    "comment": { "type": "string", "description": "Comment text for add-comment." },
    "comment_id": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Comment id for delete-comment." },
    "head": { "type": "string", "description": "PR head branch for create-pr." },
    "base": { "type": "string", "description": "PR base branch for create-pr/update-pr." },
    "pull_number": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "PR number for update-pr/request-reviewers." },
    "draft": { "type": "boolean", "description": "Draft flag for create-pr/update-pr." },
    "reviewers": { "type": "array", "items": { "type": "string" }, "description": "Reviewer usernames for request-reviewers." }
  },
  "additionalProperties": true
}
```

`github-issue-add-comment` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "comment"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number." },
    "comment": { "type": "string", "description": "Comment body text. Must be non-empty." }
  }
}
```

`github-issue-update` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number." },
    "title": { "type": "string", "description": "Updated issue title." },
    "body": { "type": "string", "description": "Updated issue body." },
    "state": { "type": "string", "description": "Issue state update (for example open/closed)." },
    "labels": { "type": "array", "items": { "type": "string" }, "description": "Replacement label list." },
    "assignees": { "type": "array", "items": { "type": "string" }, "description": "Replacement assignee list." },
    "milestone": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Milestone id." }
  },
  "notes": "At least one mutable field (title/body/state/labels/assignees/milestone) must be supplied."
}
```

`github-issue-delete-comment` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "comment_id"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number context." },
    "comment_id": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "GitHub issue comment id to delete." }
  }
}
```

`github-pr-create` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "title", "head", "base"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number context." },
    "title": { "type": "string", "description": "Pull request title." },
    "head": { "type": "string", "description": "Head/source branch name." },
    "base": { "type": "string", "description": "Base/target branch name." },
    "body": { "type": "string", "description": "Optional pull request body text." },
    "draft": { "type": "boolean", "description": "Optional draft flag." }
  }
}
```

`github-pr-update` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "pull_number"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number context." },
    "pull_number": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Pull request number to update." },
    "title": { "type": "string", "description": "Updated pull request title." },
    "body": { "type": "string", "description": "Updated pull request body." },
    "base": { "type": "string", "description": "Updated base branch name." },
    "state": { "type": "string", "description": "Updated pull request state where supported." },
    "draft": { "type": "boolean", "description": "Updated draft flag." }
  },
  "notes": "At least one mutable field (title/body/base/state/draft) must be supplied."
}
```

`github-pr-request-reviewers` input schema:
```json
{
  "type": "object",
  "required": ["repo", "issue", "pull_number", "reviewers"],
  "properties": {
    "repo": { "type": "string", "description": "GitHub repository in owner/repo format." },
    "issue": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Issue number context." },
    "pull_number": { "oneOf": [{ "type": "number" }, { "type": "string" }], "description": "Pull request number." },
    "reviewers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "GitHub usernames to request as reviewers. Must include at least one non-empty value."
    }
  }
}
```

Failure checks:
- If calls fail with access errors, verify the caller `allowDeploymentAccess.id` exactly matches receiver `trigger.deploymentAccess.ids`.
- If calls fail with missing step errors, verify caller `stepId` matches one of the updater steps listed above.
- If calls are routed but HTTP fails, verify `githubAuthHostId`/`hostId` and host allowList entries.
