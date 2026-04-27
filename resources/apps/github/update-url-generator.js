doc
    .description("Resolve GitHub issue updater URL and HTTP method from operation payload")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["operation", "repo", "issue"],
        additionalProperties: true,
        properties: {
            operation: {
                description: "Issue update operation.",
                type: "string"
            },
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
            label: {
                description: "Single label used for remove-label operation.",
                type: "string"
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
        var input = parseJson(context.getBody(), {});
        var operation = String(input.operation || "").trim();
        var repo = normalizeRepo(input.repo);
        var issue = normalizeIssue(input.issue);

        var method;
        var path;

        if (operation === "update-issue") {
            method = "PATCH";
            path = "/repos/" + repo + "/issues/" + issue;
        } else if (operation === "set-labels") {
            method = "PUT";
            path = "/repos/" + repo + "/issues/" + issue + "/labels";
        } else if (operation === "add-labels") {
            method = "POST";
            path = "/repos/" + repo + "/issues/" + issue + "/labels";
        } else if (operation === "remove-label") {
            var label = String(input.label || "").trim();
            if (!label) {
                throw new Error("label is required for remove-label operation");
            }
            method = "DELETE";
            path = "/repos/" + repo + "/issues/" + issue + "/labels/" + encodeURIComponent(label);
        } else if (operation === "add-assignees") {
            method = "POST";
            path = "/repos/" + repo + "/issues/" + issue + "/assignees";
        } else if (operation === "remove-assignees") {
            method = "DELETE";
            path = "/repos/" + repo + "/issues/" + issue + "/assignees";
        } else if (operation === "add-comment") {
            method = "POST";
            path = "/repos/" + repo + "/issues/" + issue + "/comments";
        } else {
            throw new Error("unsupported operation: " + operation);
        }

        context.setHttpMethod(method);
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");

        context.setProperty("issue_operation", operation);
        context.setProperty("issue_repo", repo);
        context.setProperty("issue_number", String(issue));
    });
