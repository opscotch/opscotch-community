# GitHub PR Watcher

Reusable Opscotch app that polls GitHub pull requests (from the issues API) and routes matched PRs to configured deployment step targets.

## Files

- `bootstrap.json`
- `workflow.json`

## Criteria shape

`data.githubPrWatcherCriteria[]`:

- `label`
- `assignee`
- `repo`
- `deploymentId`
- `stepId`

## Required data

- `watchEntity`: must be `pr`

## Optional data

- `issueHandoffDelaySeconds`: delay dispatch until a PR's `updated_at` is at least this many seconds old.
