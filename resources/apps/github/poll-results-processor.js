doc
    .description("Normalize polled GitHub issues/PRs (including search API responses), dedupe by watermark, and dispatch actionable events")
    .asUserErrors()
    .inSchema({
        type: "array",
        description: "Array of issues/PRs from GitHub API",
        items: {
            type: "object",
            required: ["number", "updated_at"],
            properties: {
                number: { type: "integer" },
                pull_request: { type: "object" },
                labels: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
                assignees: { type: "array", items: { type: "object", properties: { login: { type: "string" } } } },
                updated_at: { type: "string" },
                created_at: { type: "string" },
                html_url: { type: "string" },
                title: { type: "string" },
                body: { type: "string" }
            }
        }
    })
    .dataSchema({
        type: "object",
        additionalProperties: true,
        properties: {
            "githubIssueWatcherCriteria": {
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
                            type: "string"
                        },
                        assignee: {
                            description: "GitHub assignee login that must own the issue.",
                            type: "string"
                        },
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string"
                        },
                        deploymentId: {
                            description: "Deployment access id to call when this criterion matches.",
                            type: "string"
                        },
                        stepId: {
                            description: "Target step id in the destination deployment.",
                            type: "string"
                        }
                    }
                }
            },
            "githubPrWatcherCriteria": {
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
                            type: "string"
                        },
                        assignee: {
                            description: "GitHub assignee login that must own the pull request.",
                            type: "string"
                        },
                        repo: {
                            description: "GitHub repository in owner/repo format.",
                            type: "string"
                        },
                        deploymentId: {
                            description: "Deployment access id to call when this criterion matches.",
                            type: "string"
                        },
                        stepId: {
                            description: "Target step id in the destination deployment.",
                            type: "string"
                        }
                    }
                }
            },
            "watchEntity": {
                description: "Watcher entity type; issue watcher matches only issues, pr watcher matches only pull requests.",
                type: "string",
                enum: ["issue", "pr"]
            },
            "issueHandoffDelaySeconds": {
                description: "Wait period in seconds after issue update before dispatching matched actions.",
                type: "number",
                minimum: 0
            },
            "issueWatcherDecisionLoggingEnabled": {
                description: "When true, emits diagnostic logs for issue watcher decisions and delay handling.",
                type: "boolean"
            }
        }
    })
    .outSchema({
        type: "object",
        description: "Poll cycle result",
        required: ["status", "scanned_issues", "dispatched_actions"],
        properties: {
            status: { type: "string", description: "Operation status" },
            scanned_issues: { type: "integer", description: "Number of issues scanned" },
            dispatched_actions: { type: "integer", description: "Number of actions dispatched" }
        }
    })
    .run(() => {
        var data = JSON.parse(context.getData());
        var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;
        function toLower(value) {
            return String(value || "").toLowerCase();
        }
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        function compactDecisionDetails(details) {
            var source = details && typeof details === "object" ? details : {};
            var out = {};

            function copyIfPresent(key, maxLen) {
                if (source[key] === undefined || source[key] === null) {
                    return;
                }
                var value = source[key];
                if (typeof value === "string" && maxLen && value.length > maxLen) {
                    out[key] = value.slice(0, maxLen) + "...";
                    return;
                }
                if (Array.isArray(value)) {
                    out[key] = value.length;
                    return;
                }
                if (typeof value === "object") {
                    out[key] = "[object]";
                    return;
                }
                out[key] = value;
            }

            copyIfPresent("issue");
            copyIfPresent("watch_entity");
            copyIfPresent("matched_label");
            copyIfPresent("deployment_id");
            copyIfPresent("step_id");
            copyIfPresent("updated_at");
            copyIfPresent("previous_watermark");
            copyIfPresent("age_seconds");
            copyIfPresent("delay_seconds");
            copyIfPresent("remaining_delay_seconds");
            copyIfPresent("ready_for_dispatch");
            copyIfPresent("scanned_issues");
            copyIfPresent("dispatched_actions");
            copyIfPresent("polled_items");
            copyIfPresent("criteria_count");
            copyIfPresent("watermark_count");
            copyIfPresent("response_type");
            copyIfPresent("normalized_items");
            copyIfPresent("status_code");
            copyIfPresent("error", 180);

            return out;
        }

        function logDecision(enabled, eventName, details) {
            if (!enabled) {
                return;
            }
            var compact = compactDecisionDetails(details);
            var message = "issue-watcher decision " + eventName + " " + JSON.stringify(compact);
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
                return;
            }
            console.log(message);
        }

        function normalizeCriteria(criteria) {
            var normalized = [];
            var i;

            for (i = 0; i < criteria.length; i += 1) {
                var item = criteria[i];
                var repo = String(item.repo || "").trim();
                var assignee = toLower(item.assignee || "").trim();
                var label = toLower(item.label || "").trim();
                var deploymentId = String(item.deploymentId || "").trim();
                var stepId = String(item.stepId || "").trim();

                if (!repo || repo.indexOf("/") === -1) {
                    continue;
                }
                if (!assignee || !label || !deploymentId || !stepId) {
                    continue;
                }

                normalized.push({
                    repo: repo,
                    assignee: assignee,
                    label: label,
                    deploymentId: deploymentId,
                    stepId: stepId
                });
            }

            return normalized;
        }

        function getMatchedCriterion(criteria, labelNames, assigneeNames) {
            function contains(values, value) {
                return Array.isArray(values) && values.indexOf(value) >= 0;
            }
            for (var i = 0; i < criteria.length; i += 1) {
                var criterion = criteria[i];
                if (!contains(labelNames, criterion.label)) {
                    continue;
                }
                if (!contains(assigneeNames, criterion.assignee)) {
                    continue;
                }
                return criterion;
            }
            return null;
        }

        function isRateLimitedResponse(value, depth) {
            if (!value || typeof value !== "object" || depth > 4) {
                return false;
            }

            var error = value.error && typeof value.error === "object" ? value.error : {};
            var code = toLower(error.code || value.code || "").trim();
            if (code === "rate_limited") {
                return true;
            }

            var message = toLower(error.message || value.message || "").trim();
            if (message.indexOf("429") >= 0 || message.indexOf("rate limit") >= 0 || message.indexOf("already in progress") >= 0) {
                return true;
            }

            return isRateLimitedResponse(value.response, depth + 1) ||
                isRateLimitedResponse(value.body, depth + 1);
        }

        var watchEntity = String(data.watchEntity || "issue").toLowerCase();
        if (watchEntity !== "issue" && watchEntity !== "pr") {
            watchEntity = "issue";
        }
        var criteriaKey = watchEntity === "pr" ? "githubPrWatcherCriteria" : "githubIssueWatcherCriteria";
        var criteria = data[criteriaKey] || [];
        var issueHandoffDelaySeconds = data.issueHandoffDelaySeconds ?? 0;
        var issueHandoffDelayMs = issueHandoffDelaySeconds * 1000;
        var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;

        var body = JSON.parse(context.getBody());
        logDecision(decisionLoggingEnabled, "poll-result", {
            polled_items: body.length,
            watch_entity: watchEntity,
            criteria_count: criteria.length,
            handoff_delay_seconds: issueHandoffDelaySeconds
        });

        var persistedRaw = context.getPersistedItem("issueUpdatedAtByNumber") || "{}";
        var issueWatermarks = JSON.parse(persistedRaw);
        if (!issueWatermarks || typeof issueWatermarks !== "object" || Array.isArray(issueWatermarks)) {
            issueWatermarks = {};
        }
        logDecision(decisionLoggingEnabled, "watermark-state-loaded", {
            watermark_count: Object.keys(issueWatermarks).length
        });

        var scanned = 0;
        var dispatched = 0;

        for (var i = 0; i < body.length; i += 1) {
            var issue = body[i];
            var isPullRequest = !!issue.pull_request;
            if (watchEntity === "issue" && isPullRequest) {
                logDecision(decisionLoggingEnabled, "skip-pr-while-watching-issues", {
                    issue: issue.number
                });
                continue;
            }
            if (watchEntity === "pr" && !isPullRequest) {
                logDecision(decisionLoggingEnabled, "skip-issue-while-watching-prs", {
                    issue: issue.number
                });
                continue;
            }

            scanned += 1;

            var issueNumber = issue.number;
            var labels = Array.isArray(issue.labels) ? issue.labels : [];
            var assignees = Array.isArray(issue.assignees) ? issue.assignees : [];

            var labelNames = [];
            for (var l = 0; l < labels.length; l += 1) {
                var labelObj = labels[l] || {};
                labelNames.push(String(labelObj.name || "").toLowerCase());
            }

            var assigneeNames = [];
            for (var a = 0; a < assignees.length; a += 1) {
                assigneeNames.push(String((assignees[a] || {}).login || "").toLowerCase());
            }

            var matchedCriterion = getMatchedCriterion(criteria, labelNames, assigneeNames);
            var watermarkKey = watchEntity + ":" + issueNumber;
            var updatedAt = issue.updated_at || issue.created_at;
            if (!updatedAt) {
                updatedAt = String(context.getTimestamp());
            }
            var previousWatermark = issueWatermarks[watermarkKey];

            logDecision(decisionLoggingEnabled, "issue-evaluated", {
                issue: issueNumber,
                updated_at: updatedAt,
                previous_watermark: previousWatermark || "",
                labels: labelNames,
                assignees: assigneeNames,
                matched: !!matchedCriterion
            });

            if (!matchedCriterion) {
                logDecision(decisionLoggingEnabled, "skip-no-match", {
                    issue: issueNumber,
                    title: String(issue.title || ""),
                    labels: labelNames,
                    assignees: assigneeNames
                });
                continue;
            }

            if (issueHandoffDelayMs > 0) {
                var updatedAtTs = Date.parse(updatedAt);
                if (!Number.isFinite(updatedAtTs)) {
                    logDecision(decisionLoggingEnabled, "delay-check-skipped-invalid-updated-at", {
                        issue: issueNumber,
                        updated_at: updatedAt
                    });
                } else {
                    var issueAgeMs = context.getTimestamp() - updatedAtTs;
                    if (issueAgeMs < issueHandoffDelayMs) {
                        var remainingDelayMs = issueHandoffDelayMs - issueAgeMs;
                        logDecision(decisionLoggingEnabled, "wait-stable", {
                            issue: issueNumber,
                            updated_at: updatedAt,
                            now_timestamp: context.getTimestamp(),
                            updated_at_timestamp: updatedAtTs,
                            age_seconds: Math.floor(issueAgeMs / 1000),
                            delay_seconds: issueHandoffDelaySeconds,
                            remaining_delay_seconds: Math.ceil(remainingDelayMs / 1000)
                        });
                        continue;
                    }
                    logDecision(decisionLoggingEnabled, "delay-check-passed", {
                        issue: issueNumber,
                        updated_at: updatedAt,
                        now_timestamp: context.getTimestamp(),
                        updated_at_timestamp: updatedAtTs,
                        age_seconds: Math.floor(issueAgeMs / 1000),
                        delay_seconds: issueHandoffDelaySeconds,
                        remaining_delay_seconds: 0,
                        ready_for_dispatch: true
                    });
                }
            }

            if (issueWatermarks[watermarkKey] === updatedAt) {
                logDecision(decisionLoggingEnabled, "skip-duplicate-watermark", {
                    issue: issueNumber,
                    updated_at: updatedAt,
                    previous_watermark: previousWatermark || ""
                });
                continue;
            }

            var eventPayload = {
                entity_type: watchEntity,
                repo: matchedCriterion.repo,
                issue_number: issueNumber,
                issue_url: issue.html_url || "",
                title: issue.title || "",
                issue_body: issue.body || "",
                labels: labelNames,
                assignees: assigneeNames,
                assignee: matchedCriterion.assignee,
                matched_label: matchedCriterion.label,
                action_deployment_id: matchedCriterion.deploymentId,
                action_step_id: matchedCriterion.stepId,
                updated_at: updatedAt,
                issue_context: issue,
                pull_number: isPullRequest ? issueNumber : undefined,
                pull_url: isPullRequest ? (issue.pull_request && issue.pull_request.html_url) || issue.html_url || "" : undefined,
                pull_context: isPullRequest ? issue.pull_request || {} : undefined
            };

            logDecision(decisionLoggingEnabled, "dispatch", {
                issue: issueNumber,
                title: String(issue.title || ""),
                matched_label: matchedCriterion.label,
                deployment_id: matchedCriterion.deploymentId,
                step_id: matchedCriterion.stepId,
                updated_at: updatedAt,
                previous_watermark: previousWatermark || ""
            });
            var routeResponse;
            var routeBody;
            try {
                routeResponse = context.sendToStep("route-ticket-action", JSON.stringify(eventPayload));
                routeBody = parseJson(routeResponse ? routeResponse.getBody() : "", {});
            } catch (dispatchErr) {
                logDecision(decisionLoggingEnabled, "dispatch-failed", {
                    issue: issueNumber,
                    error: String(dispatchErr && dispatchErr.message ? dispatchErr.message : dispatchErr)
                });
                continue;
            }

            if (!routeBody || routeBody.routed !== true || routeBody.error || routeBody.status === "error" || routeBody.queued === false) {
                logDecision(decisionLoggingEnabled, "dispatch-not-acknowledged", {
                    issue: issueNumber,
                    route_response: routeBody || {}
                });
                if (isRateLimitedResponse(routeBody, 0)) {
                    logDecision(decisionLoggingEnabled, "dispatch-rate-limited-stop-tick", {
                        issue: issueNumber,
                        matched_label: matchedCriterion.label,
                        deployment_id: matchedCriterion.deploymentId,
                        step_id: matchedCriterion.stepId
                    });
                    break;
                }
                continue;
            }

            issueWatermarks[watermarkKey] = updatedAt;
            logDecision(decisionLoggingEnabled, "watermark-updated", {
                issue: issueNumber,
                watermark: updatedAt
            });
            dispatched += 1;
        }

        context.setPersistedItem("issueUpdatedAtByNumber", JSON.stringify(issueWatermarks));
        logDecision(decisionLoggingEnabled, "poll-summary", {
            scanned_issues: scanned,
            dispatched_actions: dispatched
        });
        context.setBody(JSON.stringify({
            status: "ok",
            scanned_issues: scanned,
            dispatched_actions: dispatched
        }));
    });
