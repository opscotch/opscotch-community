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
                type: "string"
            },
            issue: {
                description: "GitHub issue number.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            pull_number: {
                description: "GitHub pull request number for PR review comment retrieval.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
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
        additionalProperties: true,
        properties: {
            hostId: {
                description: "Bootstrap host id for GitHub API access.",
                type: "string"
            }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        function normalizeIssue(value) {
            var issueNumber = parseInt(String(value), 10);
            if (isNaN(issueNumber) || issueNumber <= 0) {
                throw new Error("issue must be a positive integer");
            }
            return issueNumber;
        }

        function normalizeRepo(value) {
            var repo = String(value || "").trim();
            if (!repo || repo.indexOf("/") === -1) {
                throw new Error("repo must be in owner/repo format");
            }
            return repo;
        }

        var data = parseJson(context.getData(), {});
        var hostId = String(data.hostId || "github-api").trim() || "github-api";
        var payload = parseJson(context.getBody(), {});
        var repo = normalizeRepo(payload.repo);
        var entityType = String(payload.entity_type || "issue").toLowerCase().trim();
        var issue = normalizeIssue(payload.issue);
        var pullNumber = payload.pull_number !== undefined ? normalizeIssue(payload.pull_number) : issue;
        var path = "/repos/" + repo + "/issues/" + issue + "/comments?per_page=100&sort=updated&direction=asc";
        if (entityType === "pr") {
            path = "/repos/" + repo + "/pulls/" + pullNumber + "/comments?per_page=100&sort=updated&direction=asc";
        }

        context.setHttpMethod("GET");
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
    });
