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
                    required: ["repo", "assignee", "criteria"],
                    properties: {
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
                        },
                        assignee: {
                            description: "GitHub assignee login to poll.",
                            type: "string",
                            minLength: 1
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
                    required: ["repo", "assignee", "criteria"],
                    properties: {
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
                        },
                        assignee: {
                            description: "GitHub assignee login to poll.",
                            type: "string",
                            minLength: 1
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

        function normalizeGroup(group, index) {
            var repo = String((group || {}).repo || "").trim();
            var assignee = String((group || {}).assignee || "").trim();
            var criteria = (group || {}).criteria;
            if (!repo || repo.indexOf("/") < 1) {
                throw new Error("watcher repo group " + index + " requires repo in owner/repo format");
            }
            if (!assignee) {
                throw new Error("watcher repo group " + index + " requires assignee");
            }
            if (!Array.isArray(criteria) || criteria.length === 0) {
                throw new Error("watcher repo group " + index + " requires at least one criterion");
            }
            return {
                repo: repo,
                assignee: assignee,
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

        for (var i = 0; i < groups.length; i += 1) {
            var normalized = normalizeGroup(groups[i], i);
            normalized.watchEntity = watchEntity;
            context.addSplitReturnItem(JSON.stringify(normalized));
        }
    });
