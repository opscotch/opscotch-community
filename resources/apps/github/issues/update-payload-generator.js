doc
    .description("Build GitHub issue updater request payload from operation input")
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
            },
            comment_id: {
                description: "Comment id for delete-comment operation.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            head: {
                description: "Head branch for pull request operations.",
                type: "string"
            },
            base: {
                description: "Base branch for pull request operations.",
                type: "string"
            },
            pull_number: {
                description: "Pull request number for update/reviewer operations.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            draft: {
                description: "Draft flag for create/update-pr operation.",
                type: "boolean"
            },
            reviewers: {
                description: "GitHub reviewers for request-reviewers operation.",
                type: "array",
                items: {
                    type: "string"
                }
            }
        }
    })
    .dataSchema({
        type: "object",
        additionalProperties: true,
        properties: {
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
        var data = parseJson(context.getData(), {});
        var operation = String(input.operation || data.operation || "").trim();
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
        } else if (operation === "delete-comment") {
            var commentId = parseInt(String(input.comment_id), 10);
            if (isNaN(commentId) || commentId <= 0) {
                throw new Error("comment_id is required for delete-comment");
            }
            payload = null;
        } else if (operation === "get-open-pr-by-head") {
            var head = String(input.head || "").trim();
            if (!head) {
                throw new Error("head is required for get-open-pr-by-head");
            }
            payload = null;
        } else if (operation === "create-pr") {
            var prTitle = String(input.title || "").trim();
            var prHead = String(input.head || "").trim();
            var prBase = String(input.base || "").trim();
            if (!prTitle) throw new Error("title is required for create-pr");
            if (!prHead) throw new Error("head is required for create-pr");
            if (!prBase) throw new Error("base is required for create-pr");
            payload = {
                title: prTitle,
                head: prHead,
                base: prBase
            };
            if (input.body !== undefined) payload.body = String(input.body);
            if (input.draft !== undefined) payload.draft = !!input.draft;
        } else if (operation === "update-pr") {
            var updatePullNumber = parseInt(String(input.pull_number), 10);
            if (isNaN(updatePullNumber) || updatePullNumber <= 0) {
                throw new Error("pull_number is required for update-pr");
            }
            payload = {};
            if (input.title !== undefined) payload.title = String(input.title);
            if (input.body !== undefined) payload.body = String(input.body);
            if (input.base !== undefined) payload.base = String(input.base);
            if (input.state !== undefined) payload.state = String(input.state);
            if (input.draft !== undefined) payload.draft = !!input.draft;
            if (Object.keys(payload).length === 0) {
                throw new Error("update-pr requires at least one mutable field");
            }
        } else if (operation === "request-reviewers") {
            var reviewers = normalizeList(input.reviewers, "reviewers");
            var reviewersPullNumber = parseInt(String(input.pull_number), 10);
            if (isNaN(reviewersPullNumber) || reviewersPullNumber <= 0) {
                throw new Error("pull_number is required for request-reviewers");
            }
            payload = {
                reviewers: reviewers
            };
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
