doc
    .description("Build GitHub issue updater request payload from operation input")
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
            title: {
                description: "New issue title for update-issue.",
                type: "string"
            },
            body: {
                description: "New issue body for update-issue.",
                type: "string"
            },
            state: {
                description: "Issue state for update-issue (open or closed).",
                type: "string"
            },
            labels: {
                description: "Label list for label operations.",
                type: "array",
                items: {
                    type: "string"
                }
            },
            assignees: {
                description: "Assignee list for assignee operations.",
                type: "array",
                items: {
                    type: "string"
                }
            },
            milestone: {
                description: "Milestone id for update-issue.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            comment: {
                description: "Comment text for add-comment.",
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

        function normalizeList(value, fieldName) {
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error(fieldName + " must be a non-empty array");
            }
            var out = [];
            for (var i = 0; i < value.length; i += 1) {
                var item = String(value[i] || "").trim();
                if (!item) {
                    continue;
                }
                out.push(item);
            }
            if (out.length === 0) {
                throw new Error(fieldName + " must include at least one non-empty value");
            }
            return out;
        }

        var input = parseJson(context.getBody(), {});
        var operation = String(input.operation || "").trim();
        var payload = null;

        if (operation === "update-issue") {
            payload = {};
            if (input.title !== undefined) {
                payload.title = String(input.title);
            }
            if (input.body !== undefined) {
                payload.body = String(input.body);
            }
            if (input.state !== undefined) {
                payload.state = String(input.state);
            }
            if (input.labels !== undefined) {
                payload.labels = normalizeList(input.labels, "labels");
            }
            if (input.assignees !== undefined) {
                payload.assignees = normalizeList(input.assignees, "assignees");
            }
            if (input.milestone !== undefined) {
                var milestone = parseInt(String(input.milestone), 10);
                if (isNaN(milestone)) {
                    throw new Error("milestone must be numeric");
                }
                payload.milestone = milestone;
            }
            if (Object.keys(payload).length === 0) {
                throw new Error("update-issue requires at least one mutable field");
            }
        } else if (operation === "set-labels" || operation === "add-labels") {
            payload = {
                labels: normalizeList(input.labels, "labels")
            };
        } else if (operation === "add-assignees" || operation === "remove-assignees") {
            payload = {
                assignees: normalizeList(input.assignees, "assignees")
            };
        } else if (operation === "add-comment") {
            var commentText = String(input.comment || "").trim();
            if (!commentText) {
                throw new Error("comment must be provided for add-comment");
            }
            payload = {
                body: commentText
            };
        } else if (operation === "remove-label") {
            payload = null;
        } else {
            throw new Error("unsupported operation: " + operation);
        }

        if (payload === null) {
            context.removeHeader("Content-Type");
            context.setBody("");
            return;
        }

        context.setHeader("Content-Type", "application/json");
        context.setBody(JSON.stringify(payload));
    });
