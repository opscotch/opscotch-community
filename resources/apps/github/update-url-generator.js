doc
    .description("Resolve GitHub issue updater URL and HTTP method from operation payload")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo", "issue"],
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
            },
            comment_id: {
                description: "Issue comment id used for delete-comment operation.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            head: {
                description: "Head ref for pull request operations.",
                type: "string"
            },
            pull_number: {
                description: "Pull request number for update/reviewer operations.",
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
            },
            operation: {
                description: "Optional fixed operation configured at step level.",
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
        var operation = String(input.operation || data.operation || "").trim();
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
        } else if (operation === "delete-comment") {
            var commentId = parseInt(String(input.comment_id), 10);
            if (isNaN(commentId) || commentId <= 0) {
                throw new Error("comment_id is required for delete-comment operation");
            }
            method = "DELETE";
            path = "/repos/" + repo + "/issues/comments/" + commentId;
        } else if (operation === "get-open-pr-by-head") {
            var head = String(input.head || "").trim();
            if (!head) {
                throw new Error("head is required for get-open-pr-by-head operation");
            }
            var owner = repo.split("/")[0];
            method = "GET";
            path = "/repos/" + repo + "/pulls?state=open&head=" + encodeURIComponent(owner + ":" + head);
        } else if (operation === "create-pr") {
            method = "POST";
            path = "/repos/" + repo + "/pulls";
        } else if (operation === "update-pr") {
            var pullNumber = parseInt(String(input.pull_number), 10);
            if (isNaN(pullNumber) || pullNumber <= 0) {
                throw new Error("pull_number is required for update-pr operation");
            }
            method = "PATCH";
            path = "/repos/" + repo + "/pulls/" + pullNumber;
        } else if (operation === "request-reviewers") {
            var pullNumberForReviewers = parseInt(String(input.pull_number), 10);
            if (isNaN(pullNumberForReviewers) || pullNumberForReviewers <= 0) {
                throw new Error("pull_number is required for request-reviewers operation");
            }
            method = "POST";
            path = "/repos/" + repo + "/pulls/" + pullNumberForReviewers + "/requested_reviewers";
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
