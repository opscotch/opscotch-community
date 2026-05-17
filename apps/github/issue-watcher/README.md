# GitHub Issue Watcher

Reusable Opscotch app that polls GitHub issues and routes matched tickets to configured deployment step targets.

## Files

- `bootstrap.json`
- `workflow.json`
- `resources/github-auth-processor.js`
- `resources/poll-url-generator.js`
- `resources/poll-results-processor.js`
- `resources/route-ticket-action.js`
- `resources/poll-http-error.js`

## Criteria shape

`data.githubIssueWatcherCriteria[]`:

- `label`
- `assignee`
- `repo`
- `deploymentId`
- `stepId`

## Optional data

- `issueHandoffDelaySeconds`: delay dispatch until an issue's `updated_at` is at least this many seconds old.
