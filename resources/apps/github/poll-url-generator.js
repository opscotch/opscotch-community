doc
    .description("Build GitHub polling URL from bootstrap criteria for issue or pull request watchers")
    .asUserErrors()
    .dataSchema({
        type: "object",
        additionalProperties: true,
        required: ["hostId"],
        properties: {
            hostId: {
                description: "Bootstrap host id for GitHub API access.",
                type: "string",
                minLength: 1
            },
            githubIssueWatcherCriteria: {
                description: "Routing criteria list defining label, assignee, repo, and downstream deployment/step target.",
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["label", "assignee", "repo", "deploymentId", "stepId"],
                    properties: {
                        label: {
                            description: "Label that must be present on the issue.",
                            type: "string",
                            minLength: 1
                        },
                        assignee: {
                            description: "GitHub assignee login that must own the issue.",
                            type: "string",
                            minLength: 1
                        },
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
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
            },
            githubPrWatcherCriteria: {
                description: "Routing criteria list defining label, assignee, repo, and downstream deployment/step target for pull requests.",
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["label", "assignee", "repo", "deploymentId", "stepId"],
                    properties: {
                        label: {
                            description: "Label that must be present on the pull request.",
                            type: "string",
                            minLength: 1
                        },
                        assignee: {
                            description: "GitHub assignee login that must own the pull request.",
                            type: "string",
                            minLength: 1
                        },
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string",
                            minLength: 3,
                            pattern: "^[^/]+\\/[^/]+$"
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
            },
            watchEntity: {
                description: "Watcher entity type; issue watcher matches only issues, pr watcher matches only pull requests.",
                type: "string",
                enum: ["issue", "pr"]
            },
            issueWatcherDecisionLoggingEnabled: {
                description: "When true, emits diagnostic logs for issue watcher polling URL generation.",
                type: "boolean"
            }
        }
    })
    .run(() => {
        var data = JSON.parse(context.getData());
        var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;
        var watchEntity = data.watchEntity === undefined ? "issue" : String(data.watchEntity || "").toLowerCase();
        if (watchEntity !== "issue" && watchEntity !== "pr") {
            throw new Error("watchEntity must be either issue or pr");
        }
        var criteriaKey = watchEntity === "pr" ? "githubPrWatcherCriteria" : "githubIssueWatcherCriteria";
        var criteria = data[criteriaKey];
        if (!Array.isArray(criteria) || criteria.length === 0) {
            throw new Error(criteriaKey + " must contain at least one criterion");
        }

        var primary = criteria[0];
        for (var c = 1; c < criteria.length; c += 1) {
            if (criteria[c].repo !== primary.repo || criteria[c].assignee !== primary.assignee) {
                throw new Error("all criteria must share the same repo and assignee for this single poll step");
            }
        }

        var labels = [];
        for (var i = 0; i < criteria.length; i += 1) {
            var label = criteria[i].label;
            if (labels.indexOf(label) < 0) {
                labels.push(label);
            }
        }

        var path = "";
        var labelFilterMode = "or-in-results-processor";
        var queryText = "";
        var query = "state=open"
            + "&assignee=" + encodeURIComponent(primary.assignee)
            + "&sort=updated"
            + "&direction=asc"
            + "&per_page=100";
        path = "/repos/" + primary.repo + "/issues?" + query;

        if (decisionLoggingEnabled) {
            var details = {
                host_id: data.hostId,
                watch_entity: watchEntity,
                repo: primary.repo,
                assignee: primary.assignee,
                labels: labels,
                label_filter_mode: labelFilterMode,
                path: path,
                criteria_count: criteria.length,
                raw_query: queryText
            };
            var message = "issue-watcher url poll-request-built: " + JSON.stringify(details);
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
            } else {
                console.log(message);
            }
        }

        context.setHttpMethod("GET");
        context.setUrl(data.hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
        context.setProperty("gh_watch_entity", watchEntity);
        context.setProperty("gh_repo", primary.repo);
        context.setProperty("gh_assignee", primary.assignee);
        context.setProperty("gh_issue_watcher_criteria", JSON.stringify(criteria));
    });
