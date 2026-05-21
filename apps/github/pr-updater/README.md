# GitHub PR Updater

Reusable Opscotch app for PR mutation operations using the GitHub API.

## Operations

- `create-pr`
- `update-pr`
- `request-reviewers`

## Step IDs

- `github-pr-create`
- `github-pr-update`
- `github-pr-request-reviewers`

## Cross-deployment access

This app accepts deployment-access callers with either of these IDs:

- `github-pr-updater-callers`
- `github-issue-updater-callers-pr` (compatibility ID for existing callers)

## Required data

Set deployment data:

- `githubAuthHostId` (default `github-api-auth`)
- `hostId` (default `github-api`)

See `bootstrap.json` for a complete deployment example.
