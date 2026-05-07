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
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        function toLower(value) {
            return String(value || "").toLowerCase();
        }

        function encode(value) {
            return encodeURIComponent(String(value));
        }

        function toBoolean(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }

            if (typeof value === "boolean") {
                return value;
            }

            var normalized = toLower(String(value)).trim();
            if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
                return true;
            }
            if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
                return false;
            }

            return fallback;
        }

        function logDecision(enabled, eventName, details) {
            if (!enabled) {
                return;
            }
            var message = "issue-watcher url " + eventName + ": " + JSON.stringify(details || {});
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
                return;
            }
            console.log(message);
        }

        function normalizeEntity(value) {
            var entity = toLower(String(value || "issue")).trim();
            if (entity !== "issue" && entity !== "pr") {
                throw new Error("watchEntity must be either issue or pr");
            }
            return entity;
        }

        function normalizeCriteria(data, watchEntity) {
            var key = watchEntity === "pr" ? "githubPrWatcherCriteria" : "githubIssueWatcherCriteria";
            var criteria = data[key];
            if (!Array.isArray(criteria) || criteria.length === 0) {
                throw new Error(key + " must be a non-empty array");
            }
            var normalized = [];
            var i;

            for (i = 0; i < criteria.length; i += 1) {
                var item = criteria[i];
                normalized.push({
                    repo: String(item.repo).trim(),
                    assignee: toLower(item.assignee).trim(),
                    label: toLower(item.label).trim(),
                    deploymentId: String(item.deploymentId).trim(),
                    stepId: String(item.stepId).trim()
                });
            }

            return normalized;
        }

        function uniqueLabels(criteria) {
            var labels = [];
            for (var i = 0; i < criteria.length; i += 1) {
                var label = criteria[i].label;
                if (labels.indexOf(label) < 0) {
                    labels.push(label);
                }
            }
            return labels;
        }

        var hostId = context.getData("hostId");
        var data = parseJson(context.getData(), {});
        var decisionLoggingEnabled = toBoolean(data.issueWatcherDecisionLoggingEnabled, false);
        var watchEntity = normalizeEntity(data.watchEntity);
        var criteria = normalizeCriteria(data, watchEntity);

        var primary = criteria[0];
        for (var c = 1; c < criteria.length; c += 1) {
            if (criteria[c].repo !== primary.repo || criteria[c].assignee !== primary.assignee) {
                throw new Error("all criteria must share the same repo and assignee for this single poll step");
            }
        }

        var labels = uniqueLabels(criteria);
        var path = "";
        var labelFilterMode = "or-in-results-processor";
        var queryText = "";
        if (watchEntity === "pr") {
            var searchTerms = [
                "repo:" + primary.repo,
                "is:open",
                "is:pr"
            ];
            queryText = searchTerms.join(" ");
            path = "/search/issues?q=" + encode(queryText) + "&sort=updated&order=asc&per_page=100";
            labelFilterMode = "results-processor-only";
        } else {
            var query = "state=open"
                + "&assignee=" + encode(primary.assignee)
                + "&sort=updated"
                + "&direction=asc"
                + "&per_page=100";
            path = "/repos/" + primary.repo + "/issues?" + query;
        }
        logDecision(decisionLoggingEnabled, "poll-request-built", {
            host_id: hostId,
            watch_entity: watchEntity,
            repo: primary.repo,
            assignee: primary.assignee,
            labels: labels,
            label_filter_mode: labelFilterMode,
            path: path,
            criteria_count: criteria.length,
            raw_query: queryText
        });

        context.setHttpMethod("GET");
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");
        context.setProperty("gh_watch_entity", watchEntity);
        context.setProperty("gh_repo", primary.repo);
        context.setProperty("gh_assignee", primary.assignee);
        context.setProperty("gh_issue_watcher_criteria", JSON.stringify(criteria));
    });
