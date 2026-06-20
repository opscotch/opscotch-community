doc
    .description("Wrap one GitHub poll response with its repo group metadata")
    .asUserErrors()
    .inSchema({
        oneOf: [
            {
                type: "array",
                description: "GitHub issues API array response.",
                items: {
                    type: "object",
                    additionalProperties: true
                }
            },
            {
                type: "object",
                description: "GitHub search-style response.",
                additionalProperties: true,
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: true
                        }
                    }
                }
            }
        ]
    })
    .outSchema({
        type: "object",
        required: ["repo", "assignee", "watchEntity", "criteria", "items"],
        additionalProperties: true,
        properties: {
            repo: {
                type: "string",
                pattern: "^[^/]+\\/[^/]+$"
            },
            assignee: { type: "string" },
            watchEntity: { type: "string", enum: ["issue", "pr"] },
            criteria: {
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["label", "deploymentId", "stepId"],
                    properties: {
                        label: { type: "string", minLength: 1 },
                        deploymentId: { type: "string", minLength: 1 },
                        stepId: { type: "string", minLength: 1 }
                    }
                }
            },
            items: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: true
                }
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

        var group = parseJson(context.getProperty("gh_poll_group"), null);
        if (!group || !group.repo || !group.assignee || !group.watchEntity || !Array.isArray(group.criteria)) {
            throw new Error("missing GitHub poll group metadata");
        }

        var response = parseJson(context.getBody(), []);
        var items = Array.isArray(response) ? response : (Array.isArray(response.items) ? response.items : []);

        context.setBody(JSON.stringify({
            repo: group.repo,
            assignee: group.assignee,
            watchEntity: group.watchEntity,
            criteria: group.criteria,
            items: items
        }));
    });
