# GitHub Issue Updater

Reusable Opscotch app for mutating GitHub issues from workflows.

## Step

- `github-issue-updater`

## Input payload

```json
{
  "operation": "update-issue",
  "repo": "owner/repo",
  "issue": 317,
  "title": "Optional new title",
  "body": "Optional new body",
  "state": "open"
}
```

### Supported operations

- `update-issue`
- `set-labels`
- `add-labels`
- `remove-label`
- `add-assignees`
- `remove-assignees`
- `add-comment`

## Bootstrap requirements

- Configure `allowExternalHostAccess` host `github-api` with restricted token data.
- Configure `allowDeploymentAccess` receive id `github-issue-updater-callers`.

## Notes

- `hostId` defaults to `github-api`.
- `repo` must be `owner/repo`.
- `issue` must be a positive integer.
