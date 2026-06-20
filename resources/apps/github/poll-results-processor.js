doc
    .description("Evaluate grouped GitHub issue/PR poll results, dedupe by repo-aware watermark, and dispatch actionable events")
    .asUserErrors()
    .inSchema({
        type: "array",
        description: "Array of grouped poll results from poll-item-result-processor",
        items: {
            type: "object",
            required: ["repo", "assignee", "watchEntity", "criteria", "items"],
            additionalProperties: true,
            properties: {
                repo: {
                    type: "string",
                    pattern: "^[^/]+\\/[^/]+$"
                },
                assignee: { type: "string", minLength: 1 },
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
                        additionalProperties: true,
                        required: ["number"],
                        properties: {
                            number: { type: "integer" },
                            pull_request: { type: "object" },
                            labels: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: true,
                                    properties: {
                                        name: { type: "string" }
                                    }
                                }
                            },
                            assignees: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: true,
                                    properties: {
                                        login: { type: "string" }
                                    }
                                }
                            },
                            updated_at: { type: "string" },
                            created_at: { type: "string" },
                            html_url: { type: "string" },
                            title: { type: "string" },
                            body: { type: "string" }
                        }
                    }
                }
            }
        }
    })
    .dataSchema({
        type: "object",
        additionalProperties: true,
        properties: {
            issueHandoffDelaySeconds: {
                description: "Wait period in seconds after issue update before dispatching matched actions.",
                type: "number",
                minimum: 0
            },
            issueWatcherDecisionLoggingEnabled: {
                description: "When true, emits diagnostic logs for watcher decisions and delay handling.",
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
            scanned_issues: { type: "integer", description: "Number of issues/PRs scanned" },
            dispatched_actions: { type: "integer", description: "Number of actions dispatched" }
        }
    })
    .run(() => {
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

            [
                "repo",
                "issue",
                "watch_entity",
                "matched_label",
                "deployment_id",
                "step_id",
                "updated_at",
                "previous_watermark",
                "age_seconds",
                "delay_seconds",
                "remaining_delay_seconds",
                "ready_for_dispatch",
                "scanned_issues",
                "dispatched_actions",
                "polled_items",
                "criteria_count",
                "watermark_count",
                "poll_group_count",
                "error"
            ].forEach((key) => copyIfPresent(key, key === "error" ? 180 : undefined));

            return out;
        }

        function logDecision(enabled, eventName, details) {
            if (!enabled) {
                return;
            }
            var compact = compactDecisionDetails(details);
            var message = "github-watcher decision " + eventName + " " + JSON.stringify(compact);
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
                return;
            }
            console.log(message);
        }

        function normalizeCriteria(repo, assignee, criteria) {
            var normalized = [];
            var normalizedAssignee = toLower(assignee).trim();

            for (var i = 0; i < criteria.length; i += 1) {
                var item = criteria[i] || {};
                var label = toLower(item.label || "").trim();
                var deploymentId = String(item.deploymentId || "").trim();
                var stepId = String(item.stepId || "").trim();

                if (!label || !deploymentId || !stepId) {
                    continue;
                }

                normalized.push({
                    repo: repo,
                    assignee: normalizedAssignee,
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

        var data = JSON.parse(context.getData());
        var issueHandoffDelaySeconds = data.issueHandoffDelaySeconds ?? 0;
        var issueHandoffDelayMs = issueHandoffDelaySeconds * 1000;
        var decisionLoggingEnabled = data.issueWatcherDecisionLoggingEnabled ?? false;
        var pollGroups = JSON.parse(context.getBody());

        var totalItems = 0;
        for (var gCount = 0; gCount < pollGroups.length; gCount += 1) {
            totalItems += Array.isArray((pollGroups[gCount] || {}).items) ? pollGroups[gCount].items.length : 0;
        }
        logDecision(decisionLoggingEnabled, "poll-result", {
            poll_group_count: pollGroups.length,
            polled_items: totalItems,
            handoff_delay_seconds: issueHandoffDelaySeconds
        });

        var persistedRaw = context.getPersistedItem("issueUpdatedAtByNumber") || "{}";
        var issueWatermarks = parseJson(persistedRaw, {});
        if (!issueWatermarks || typeof issueWatermarks !== "object" || Array.isArray(issueWatermarks)) {
            issueWatermarks = {};
        }
        logDecision(decisionLoggingEnabled, "watermark-state-loaded", {
            watermark_count: Object.keys(issueWatermarks).length
        });

        var scanned = 0;
        var dispatched = 0;
        var stopTick = false;

        for (var g = 0; g < pollGroups.length && !stopTick; g += 1) {
            var group = pollGroups[g] || {};
            var repo = String(group.repo || "").trim();
            var assignee = String(group.assignee || "").trim();
            var watchEntity = toLower(group.watchEntity || "issue").trim();
            var criteria = normalizeCriteria(repo, assignee, Array.isArray(group.criteria) ? group.criteria : []);
            var body = Array.isArray(group.items) ? group.items : [];

            if (!repo || !assignee || (watchEntity !== "issue" && watchEntity !== "pr") || criteria.length === 0) {
                logDecision(decisionLoggingEnabled, "skip-invalid-poll-group", {
                    repo: repo,
                    watch_entity: watchEntity,
                    criteria_count: criteria.length
                });
                continue;
            }

            for (var i = 0; i < body.length; i += 1) {
                var issue = body[i];
                var isPullRequest = !!issue.pull_request;
                if (watchEntity === "issue" && isPullRequest) {
                    logDecision(decisionLoggingEnabled, "skip-pr-while-watching-issues", {
                        repo: repo,
                        issue: issue.number
                    });
                    continue;
                }
                if (watchEntity === "pr" && !isPullRequest) {
                    logDecision(decisionLoggingEnabled, "skip-issue-while-watching-prs", {
                        repo: repo,
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
                    labelNames.push(toLower(labelObj.name));
                }

                var assigneeNames = [];
                for (var a = 0; a < assignees.length; a += 1) {
                    assigneeNames.push(toLower((assignees[a] || {}).login));
                }

                var matchedCriterion = getMatchedCriterion(criteria, labelNames, assigneeNames);
                var watermarkKey = watchEntity + ":" + repo + ":" + issueNumber;
                var updatedAt = issue.updated_at || issue.created_at;
                if (!updatedAt) {
                    updatedAt = String(context.getTimestamp());
                }
                var previousWatermark = issueWatermarks[watermarkKey];

                logDecision(decisionLoggingEnabled, "issue-evaluated", {
                    repo: repo,
                    issue: issueNumber,
                    updated_at: updatedAt,
                    previous_watermark: previousWatermark || "",
                    labels: labelNames,
                    assignees: assigneeNames,
                    matched: !!matchedCriterion
                });

                if (!matchedCriterion) {
                    logDecision(decisionLoggingEnabled, "skip-no-match", {
                        repo: repo,
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
                            repo: repo,
                            issue: issueNumber,
                            updated_at: updatedAt
                        });
                    } else {
                        var issueAgeMs = context.getTimestamp() - updatedAtTs;
                        if (issueAgeMs < issueHandoffDelayMs) {
                            var remainingDelayMs = issueHandoffDelayMs - issueAgeMs;
                            logDecision(decisionLoggingEnabled, "wait-stable", {
                                repo: repo,
                                issue: issueNumber,
                                updated_at: updatedAt,
                                age_seconds: Math.floor(issueAgeMs / 1000),
                                delay_seconds: issueHandoffDelaySeconds,
                                remaining_delay_seconds: Math.ceil(remainingDelayMs / 1000)
                            });
                            continue;
                        }
                        logDecision(decisionLoggingEnabled, "delay-check-passed", {
                            repo: repo,
                            issue: issueNumber,
                            updated_at: updatedAt,
                            age_seconds: Math.floor(issueAgeMs / 1000),
                            delay_seconds: issueHandoffDelaySeconds,
                            remaining_delay_seconds: 0,
                            ready_for_dispatch: true
                        });
                    }
                }

                if (issueWatermarks[watermarkKey] === updatedAt) {
                    logDecision(decisionLoggingEnabled, "skip-duplicate-watermark", {
                        repo: repo,
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
                    repo: repo,
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
                        repo: repo,
                        issue: issueNumber,
                        error: String(dispatchErr && dispatchErr.message ? dispatchErr.message : dispatchErr)
                    });
                    continue;
                }

                if (!routeBody || routeBody.routed !== true || routeBody.error || routeBody.status === "error" || routeBody.queued === false) {
                    logDecision(decisionLoggingEnabled, "dispatch-not-acknowledged", {
                        repo: repo,
                        issue: issueNumber,
                        route_response: routeBody || {}
                    });
                    if (isRateLimitedResponse(routeBody, 0)) {
                        logDecision(decisionLoggingEnabled, "dispatch-rate-limited-stop-tick", {
                            repo: repo,
                            issue: issueNumber,
                            matched_label: matchedCriterion.label,
                            deployment_id: matchedCriterion.deploymentId,
                            step_id: matchedCriterion.stepId
                        });
                        stopTick = true;
                        break;
                    }
                    continue;
                }

                issueWatermarks[watermarkKey] = updatedAt;
                logDecision(decisionLoggingEnabled, "watermark-updated", {
                    repo: repo,
                    issue: issueNumber,
                    watermark: updatedAt
                });
                dispatched += 1;
            }
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
