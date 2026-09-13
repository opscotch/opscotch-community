doc
    .description("Split GitHub watcher repo groups into one poll item per repo and assignee")
    .asUserErrors()
    .dataSchema({
        type: "object",
        additionalProperties: true,
        oneOf: [
            {
                required: ["githubIssueWatcherRepos"],
                properties: {
                    watchEntity: {
                        type: "string",
                        enum: ["issue"]
                    }
                }
            },
            {
                required: ["watchEntity", "githubPrWatcherRepos"],
                properties: {
                    watchEntity: {
                        type: "string",
                        enum: ["pr"]
                    }
                }
            }
        ],
        properties: {
            githubIssueWatcherRepos: {
                description: "Issue watcher repo groups. Each group is one polling unit.",
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["repo", "criteria"],
                    properties: {
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
                        },
                        assignee: {
                            description: "Optional direct GitHub assignee login to poll. May be combined with assignees.",
                            type: "string",
                            minLength: 1
                        },
                        assignees: {
                            description: "Optional group-derived GitHub assignee logins to poll.",
                            type: "array",
                            minItems: 1,
                            items: {
                                type: "string",
                                minLength: 1
                            }
                        },
                        criteria: {
                            description: "Routing criteria for this repo and assignee poll group.",
                            type: "array",
                            minItems: 1,
                            items: {
                                type: "object",
                                additionalProperties: true,
                                required: ["label", "deploymentId", "stepId"],
                                properties: {
                                    label: {
                                        description: "Label that must be present on the issue.",
                                        type: "string",
                                        minLength: 1
                                    },
                                    deploymentId: {
                                        description: "Deployment access id to call when this criterion matches.",
                                        type: "string",
                                        minLength: 1
                                    },
                                    stepId: {
                                        description: "Target step id in the destination deployment.",
                                        type: "string",
                                        minLength: 1
                                    }
                                }
                            }
                        }
                    }
                }
            },
            githubPrWatcherRepos: {
                description: "PR watcher repo groups. Each group is one polling unit.",
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["repo", "criteria"],
                    properties: {
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
                        },
                        assignee: {
                            description: "Optional direct GitHub assignee login to poll. May be combined with assignees.",
                            type: "string",
                            minLength: 1
                        },
                        assignees: {
                            description: "Optional group-derived GitHub assignee logins to poll.",
                            type: "array",
                            minItems: 1,
                            items: {
                                type: "string",
                                minLength: 1
                            }
                        },
                        criteria: {
                            description: "Routing criteria for this repo and assignee poll group.",
                            type: "array",
                            minItems: 1,
                            items: {
                                type: "object",
                                additionalProperties: true,
                                required: ["label", "deploymentId", "stepId"],
                                properties: {
                                    label: {
                                        description: "Label that must be present on the pull request.",
                                        type: "string",
                                        minLength: 1
                                    },
                                    deploymentId: {
                                        description: "Deployment access id to call when this criterion matches.",
                                        type: "string",
                                        minLength: 1
                                    },
                                    stepId: {
                                        description: "Target step id in the destination deployment.",
                                        type: "string",
                                        minLength: 1
                                    }
                                }
                            }
                        }
                    }
                }
            },
            watchEntity: {
                type: "string",
                enum: ["issue", "pr"]
            }
        }
    })
    .run(() => {
        function normalizeCriterion(item) {
            var label = String((item || {}).label || "").trim();
            var deploymentId = String((item || {}).deploymentId || "").trim();
            var stepId = String((item || {}).stepId || "").trim();
            if (!label || !deploymentId || !stepId) {
                throw new Error("each watcher criterion requires label, deploymentId, and stepId");
            }
            return {
                label: label,
                deploymentId: deploymentId,
                stepId: stepId
            };
        }

        function normalizeAssignees(group, index) {
            var values = [];
            if ((group || {}).assignee !== undefined) {
                if (typeof group.assignee !== "string") {
                    throw new Error("watcher repo group " + index + " assignee must be a string");
                }
                values.push(group.assignee);
            }
            if ((group || {}).assignees !== undefined) {
                if (!Array.isArray(group.assignees)) {
                    throw new Error("watcher repo group " + index + " assignees must be an array");
                }
                values = values.concat(group.assignees);
            }

            var assignees = [];
            var seen = {};
            for (var i = 0; i < values.length; i += 1) {
                if (typeof values[i] !== "string") {
                    throw new Error("watcher repo group " + index + " assignee entries must be strings");
                }
                var login = values[i].trim();
                if (!login) {
                    throw new Error("watcher repo group " + index + " assignee entries must not be empty");
                }
                var key = login.toLowerCase();
                if (!seen[key]) {
                    seen[key] = true;
                    assignees.push(login);
                }
            }
            if (assignees.length === 0) {
                throw new Error("watcher repo group " + index + " requires assignee or assignees");
            }
            return assignees;
        }

        function normalizeGroup(group, index) {
            var repo = String((group || {}).repo || "").trim();
            var criteria = (group || {}).criteria;
            if (!repo || repo.indexOf("/") < 1) {
                throw new Error("watcher repo group " + index + " requires repo in owner/repo format");
            }
            if (!Array.isArray(criteria) || criteria.length === 0) {
                throw new Error("watcher repo group " + index + " requires at least one criterion");
            }
            return {
                repo: repo,
                assignees: normalizeAssignees(group, index),
                criteria: criteria.map(normalizeCriterion)
            };
        }

        var data = JSON.parse(context.getData());
        var watchEntity = data.watchEntity === undefined ? "issue" : String(data.watchEntity || "").toLowerCase();
        if (watchEntity !== "issue" && watchEntity !== "pr") {
            throw new Error("watchEntity must be either issue or pr");
        }

        var groupsKey = watchEntity === "pr" ? "githubPrWatcherRepos" : "githubIssueWatcherRepos";
        var groups = data[groupsKey];
        if (!Array.isArray(groups) || groups.length === 0) {
            throw new Error(groupsKey + " must contain at least one repo group");
        }

        context.sendMetric(context.getTimestamp(), "github.poll.started", 1.0, {
            watch_entity: watchEntity,
            group_count: String(groups.length)
        });

        for (var i = 0; i < groups.length; i += 1) {
            var normalized = normalizeGroup(groups[i], i);
            for (var j = 0; j < normalized.assignees.length; j += 1) {
                context.addSplitReturnItem(JSON.stringify({
                    repo: normalized.repo,
                    assignee: normalized.assignees[j],
                    criteria: normalized.criteria,
                    watchEntity: watchEntity
                }));
            }
        }
    });
