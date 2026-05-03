doc
    .description("Normalize polled GitHub issues, dedupe by watermark, and dispatch actionable events")
    .asUserErrors()
    .inSchema({
        type: "array",
        items: {
            type: "object",
            additionalProperties: true,
            properties: {
                number: {
                    description: "Issue number returned by GitHub.",
                    oneOf: [
                        { type: "number" },
                        { type: "string" }
                    ]
                },
                pull_request: {
                    description: "Present when the item is a pull request rather than an issue.",
                    type: "object"
                },
                labels: {
                    description: "Issue labels used to determine routing eligibility.",
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                            name: {
                                description: "Label name as returned by GitHub.",
                                type: "string"
                            }
                        }
                    }
                },
                assignees: {
                    description: "Assignees currently associated with the issue.",
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                            login: {
                                description: "GitHub login for an assignee.",
                                type: "string"
                            }
                        }
                    }
                },
                updated_at: {
                    description: "Issue update timestamp used for dedupe watermarking.",
                    type: "string"
                },
                created_at: {
                    description: "Issue creation timestamp used as fallback watermark.",
                    type: "string"
                },
                html_url: {
                    description: "Canonical URL of the issue.",
                    type: "string"
                },
                title: {
                    description: "Issue title used in downstream payloads.",
                    type: "string"
                },
                body: {
                    description: "Issue body text returned by GitHub.",
                    type: "string"
                }
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
                        },
                        instructions: {
                            description: "Optional prompt preamble lines to pass through to downstream action payloads.",
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    }
                }
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

        function contains(array, value) {
            return array.indexOf(value) >= 0;
        }

        function toNonNegativeNumber(value, fallback) {
            var number = Number(value);
            if (!Number.isFinite(number)) {
                return fallback;
            }
            if (number < 0) {
                return 0;
            }
            return number;
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
            var message = "issue-watcher decision " + eventName + ": " + JSON.stringify(details || {});
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
                var instructionsInput = Array.isArray(item.instructions) ? item.instructions : [];
                var instructions = [];
                for (var j = 0; j < instructionsInput.length; j += 1) {
                    var line = String(instructionsInput[j] || "").trim();
                    if (line) {
                        instructions.push(line);
                    }
                }

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
                    stepId: stepId,
                    instructions: instructions
                });
            }

            return normalized;
        }

        function getMatchedCriterion(criteria, labelNames, assigneeNames) {
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

        var criteria = normalizeCriteria(parseJson(context.getData("githubIssueWatcherCriteria"), []));
        var issueHandoffDelaySeconds = toNonNegativeNumber(context.getData("issueHandoffDelaySeconds"), 0);
        var issueHandoffDelayMs = issueHandoffDelaySeconds * 1000;
        var decisionLoggingEnabled = toBoolean(context.getData("issueWatcherDecisionLoggingEnabled"), false);

        var body = parseJson(context.getBody(), []);
        logDecision(decisionLoggingEnabled, "poll-result", {
            polled_items: body.length,
            criteria_count: criteria.length,
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

        for (var i = 0; i < body.length; i += 1) {
            var issue = body[i];
            if (issue.pull_request) {
                logDecision(decisionLoggingEnabled, "skip-pull-request", {
                    issue: issue.number
                });
                continue;
            }

            scanned += 1;

            var issueNumber = issue.number;
            var labels = issue.labels;
            var assignees = issue.assignees;

            var labelNames = [];
            for (var l = 0; l < labels.length; l += 1) {
                var labelObj = labels[l] || {};
                labelNames.push(toLower(labelObj.name || ""));
            }

            var assigneeNames = [];
            for (var a = 0; a < assignees.length; a += 1) {
                assigneeNames.push(toLower((assignees[a] || {}).login || ""));
            }

            var matchedCriterion = getMatchedCriterion(criteria, labelNames, assigneeNames);
            var watermarkKey = String(issueNumber);
            var updatedAt = String(issue.updated_at || issue.created_at || "");
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
                instructions: matchedCriterion.instructions || [],
                updated_at: updatedAt,
                issue_context: issue
            };

            logDecision(decisionLoggingEnabled, "dispatch", {
                issue: issueNumber,
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

            if (!routeBody || routeBody.routed !== true) {
                logDecision(decisionLoggingEnabled, "dispatch-not-acknowledged", {
                    issue: issueNumber,
                    route_response: routeBody || {}
                });
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
