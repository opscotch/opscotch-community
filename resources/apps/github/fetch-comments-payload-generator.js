doc
    .description("Build GitHub GraphQL payload for unresolved pull request review thread comments")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo", "issue"],
        additionalProperties: true,
        properties: {
            repo: {
                description: "GitHub repository in owner/repo format.",
                type: "string",
                pattern: "^[^/]+\\/[^/]+$"
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
    .run(() => {
        function normalizeIssue(value) {
            var issueNumber = parseInt(String(value), 10);
            if (isNaN(issueNumber) || issueNumber <= 0) {
                throw new Error("issue must be a positive integer");
            }
            return issueNumber;
        }

        var payload = JSON.parse(context.getBody());
        var entityType = String(payload.entity_type || "issue").toLowerCase().trim();
        if (entityType !== "pr") {
            context.setBody("");
            return;
        }
        var repo = String(payload.repo || "").trim();
        if (!repo || repo.indexOf("/") === -1) {
            throw new Error("repo must be in owner/repo format");
        }
        var parts = repo.split("/");
        var pullNumber = payload.pull_number !== undefined ? normalizeIssue(payload.pull_number) : normalizeIssue(payload.issue);

        var query = [
            "query($owner:String!,$name:String!,$number:Int!){",
            "repository(owner:$owner,name:$name){",
            "pullRequest(number:$number){",
            "reviewThreads(first:100){",
            "nodes{",
            "id",
            "isResolved",
            "comments(first:100){",
            "nodes{",
            "id",
            "databaseId",
            "body",
            "author{login}",
            "createdAt",
            "updatedAt",
            "url",
            "path",
            "line",
            "originalLine",
            "diffHunk",
            "}",
            "}",
            "}",
            "}",
            "}",
            "}",
            "}"
        ].join(" ");

        context.setHeader("Content-Type", "application/json");
        context.setBody(JSON.stringify({
            query: query,
            variables: {
                owner: parts[0],
                name: parts.slice(1).join("/"),
                number: pullNumber
            }
        }));
    });
