doc
    .description("Build GitHub issue comments URL for an issue event")
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
        var issue = normalizeIssue(payload.issue);
        var path = "/repos/" + repo + "/issues/" + issue + "/comments?per_page=100&sort=updated&direction=asc";

        context.setHttpMethod("GET");
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
    });
