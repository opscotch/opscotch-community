doc
    .description("Build GitHub comments URL for issue or pull request events")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo", "issue"],
        additionalProperties: true,
        properties: {
            repo: {
                description: "GitHub repository in owner/repo format.",
                type: "string",
                minLength: 3,
                pattern: "^[^/]+\\/[^/]+$"
            },
            issue: {
                description: "GitHub issue number.",
                oneOf: [
                    { type: "number", minimum: 1 },
                    { type: "string", pattern: "^[1-9][0-9]*$" }
                ]
            },
            pull_number: {
                description: "GitHub pull request number for PR review comment retrieval.",
                oneOf: [
                    { type: "number", minimum: 1 },
                    { type: "string", pattern: "^[1-9][0-9]*$" }
                ]
            },
            entity_type: {
                description: "Event entity type (issue or pr).",
                type: "string",
                enum: ["issue", "pr"]
            }
        }
    })
    .dataSchema({
        type: "object",
        required: ["hostId"],
        additionalProperties: true,
        properties: {
            hostId: {
                description: "Bootstrap host id for GitHub API access.",
                type: "string",
                minLength: 1
            }
        }
    })
    .run(() => {
        function normalizeIssue(value) {
            var issueNumber = parseInt(String(value), 10);
            if (isNaN(issueNumber) || issueNumber <= 0) {
                throw new Error("issue must be a positive integer");
            }
            return issueNumber;
        }

        var data = JSON.parse(context.getData());
        var hostId = String(data.hostId).trim();
        var payload = JSON.parse(context.getBody());
        var repo = String(payload.repo).trim();
        var entityType = String(payload.entity_type || "issue").toLowerCase().trim();
        var issue = normalizeIssue(payload.issue);
        var pullNumber = payload.pull_number !== undefined ? normalizeIssue(payload.pull_number) : issue;
        var path = "/repos/" + repo + "/issues/" + issue + "/comments?per_page=100&sort=updated&direction=asc";
        if (entityType === "pr") {
            context.setHttpMethod("POST");
            context.setUrl(hostId, "/graphql");
            context.setHeader("Accept", "application/vnd.github+json");
            context.setHeader("X-GitHub-Api-Version", "2022-11-28");
            return;
        }

        context.setHttpMethod("GET");
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
    });
