doc
    .description("Route issue event to the configured deployment and action step")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo", "issue_number"],
        additionalProperties: true,
        properties: {
            repo: {
                description: "GitHub repository in owner/repo format.",
                type: "string"
            },
            issue_number: {
                description: "Issue number selected for routing.",
                oneOf: [
                    { type: "number" },
                    { type: "string" }
                ]
            },
            issue_url: {
                description: "Canonical URL for the issue.",
                type: "string"
            },
            title: {
                description: "Issue title included in downstream payloads.",
                type: "string"
            },
            issue_body: {
                description: "Issue body text to provide full ticket context downstream.",
                type: "string"
            },
            issue_context: {
                description: "Full GitHub issue object captured during polling.",
                type: "object"
            },
            labels: {
                description: "Normalized label names found on the issue.",
                type: "array",
                items: {
                    description: "Single normalized label value.",
                    type: "string"
                }
            },
            matched_label: {
                description: "Label from the matched bootstrap criterion.",
                type: "string"
            },
            action_deployment_id: {
                description: "Deployment access id for cross-deployment routing.",
                type: "string"
            },
            action_step_id: {
                description: "Step id from the matched bootstrap criterion.",
                type: "string"
            },
            instructions: {
                description: "Optional prompt preamble lines from matched watcher criteria.",
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
            defaultActionDeploymentId: {
                description: "Legacy fallback deployment access id for label-routed events.",
                type: "string"
            },
            issueUpdaterDeploymentAccessId: {
                description: "Deployment access id for posting prerequisite reminder comments.",
                type: "string"
            },
            issueUpdaterAddCommentStepId: {
                description: "Step id for posting prerequisite reminder comments.",
                type: "string"
            },
            issueWatcherDecisionLoggingEnabled: {
                description: "When true, emits diagnostic logs for ticket routing decisions.",
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

        function contains(array, value) {
            return array.indexOf(value) >= 0;
        }

        function toLower(value) {
            return String(value || "").toLowerCase();
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
            var message = "issue-watcher route " + eventName + ": " + JSON.stringify(details || {});
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog(message);
                return;
            }
            console.log(message);
        }

        function fetchComments(repo, issue, loggingEnabled) {
            var response;
            var normalized = [];

            try {
                response = context.sendToStep("fetch-issue-comments", JSON.stringify({
                    repo: repo,
                    issue: issue
                }));
            } catch (err) {
                logDecision(loggingEnabled, "comments-fetch-failed-call", {
                    issue: issue,
                    error: String(err && err.message ? err.message : err)
                });
                return normalized;
            }

            try {
                var result = parseJson(response.getBody(), {});
                if (Array.isArray(result.comments)) {
                    normalized = result.comments;
                }
                logDecision(loggingEnabled, "comments-fetch-complete", {
                    issue: issue,
                    comments_count: normalized.length,
                    status: String(result.status || "unknown")
                });
                return normalized;
            } catch (err2) {
                logDecision(loggingEnabled, "comments-fetch-failed-parse", {
                    issue: issue,
                    error: String(err2 && err2.message ? err2.message : err2)
                });
                return normalized;
            }
        }

        function sendAction(deploymentId, stepId, payload) {
            var serialized = JSON.stringify(payload);
            if (deploymentId) {
                return context.sendToStep(deploymentId, stepId, serialized);
            }
            return context.sendToStep(stepId, serialized);
        }

        function resolveRefineRoutingConfig(label) {
            var matched = String(label || "").trim().toLowerCase();
            if (matched === "dev review") {
                return {
                    workflow: "implementation-planning",
                    model: "codex-mini"
                };
            }
            return {
                workflow: "quick-spec",
                model: "minimax"
            };
        }

        function resolveDevelopRoutingConfig() {
            return {
                workflow: "implementation-planning",
                model: "codex"
            };
        }

        function extractLastBaseBranch(issueBody, comments) {
            var pattern = /(?:^|\s)base_branch\s*=\s*([^\s`]+)/ig;
            var candidate = "";

            var bodyText = String(issueBody || "");
            var bodyMatch;
            while ((bodyMatch = pattern.exec(bodyText)) !== null) {
                if (bodyMatch[1]) {
                    candidate = String(bodyMatch[1]).trim();
                }
            }

            if (!Array.isArray(comments)) {
                return candidate;
            }

            for (var i = 0; i < comments.length; i += 1) {
                var comment = comments[i];
                var text = "";
                if (comment && typeof comment === "object" && comment.body !== undefined) {
                    text = String(comment.body || "");
                } else if (typeof comment === "string") {
                    text = comment;
                }
                if (!text) {
                    continue;
                }
                var commentMatch;
                while ((commentMatch = pattern.exec(text)) !== null) {
                    if (commentMatch[1]) {
                        candidate = String(commentMatch[1]).trim();
                    }
                }
            }
            return candidate;
        }

        function hasDevelopPrereqReminder(comments) {
            var marker = "development is waiting on prerequisites.";
            var list = Array.isArray(comments) ? comments : [];
            for (var i = 0; i < list.length; i += 1) {
                var comment = list[i];
                var body = "";
                if (comment && typeof comment === "object" && comment.body !== undefined) {
                    body = String(comment.body || "");
                } else if (typeof comment === "string") {
                    body = comment;
                }
                if (toLower(body).indexOf(marker) >= 0) {
                    return true;
                }
            }
            return false;
        }

        function isDispatchFailure(responseBody) {
            if (!responseBody || typeof responseBody !== "object") {
                return false;
            }
            if (responseBody.queued === false) {
                return true;
            }
            if (String(responseBody.status || "").toLowerCase() === "error") {
                return true;
            }
            if (String(responseBody.routed || "").toLowerCase() === "false") {
                return true;
            }
            return false;
        }

        function isAuthorApprovalGranted(comments, authorLogin) {
            var normalizedAuthor = toLower(String(authorLogin || "").trim());
            if (!normalizedAuthor) {
                return false;
            }

            var approved = false;
            var list = Array.isArray(comments) ? comments : [];
            var approvePattern = /\b(approve|approved|go ahead|proceed|please apply|please implement|apply changes|implement now|start coding|start implementation|ship it|lgtm)\b/i;
            var revokePattern = /\b(cancel|hold|stop|do not code|don't code|do not implement|don't implement|wait)\b/i;

            for (var i = 0; i < list.length; i += 1) {
                var comment = list[i];
                if (!comment || typeof comment !== "object") {
                    continue;
                }
                var login = toLower(
                    (comment.user && comment.user.login)
                    || (comment.author && comment.author.login)
                    || comment.login
                    || ""
                );
                if (login !== normalizedAuthor) {
                    continue;
                }
                var body = String(comment.body || "");
                if (!body) {
                    continue;
                }
                if (revokePattern.test(body)) {
                    approved = false;
                    continue;
                }
                if (approvePattern.test(body)) {
                    approved = true;
                }
            }
            return approved;
        }

        var data = parseJson(context.getData(), {});
        var eventPayload = parseJson(context.getBody(), {});
        var labels = eventPayload.labels || [];
        var issueNumber = eventPayload.issue_number;
        var repo = String(eventPayload.repo || "");
        var decisionLoggingEnabled = toBoolean(data.issueWatcherDecisionLoggingEnabled, false);

        var actionDeploymentId = String(eventPayload.action_deployment_id || "").trim();
        var actionStepId = String(eventPayload.action_step_id || "").trim();
        var matchedLabel = String(eventPayload.matched_label || "").trim();
        logDecision(decisionLoggingEnabled, "received-event", {
            issue: issueNumber,
            repo: repo,
            labels: labels,
            incoming_deployment_id: actionDeploymentId,
            incoming_step_id: actionStepId,
            matched_label: matchedLabel
        });

        if (!actionStepId) {
            actionDeploymentId = String(data.defaultActionDeploymentId || "").trim();
            if (contains(labels, "triage")) {
                actionStepId = "dispatch-bmad-refine";
                matchedLabel = "triage";
            } else if (contains(labels, "dev review")) {
                actionStepId = "dispatch-bmad-refine";
                matchedLabel = "dev review";
            } else if (contains(labels, "read for dev")) {
                actionStepId = "dispatch-bmad-develop";
                matchedLabel = "read for dev";
            } else if (contains(labels, "dev-ready")) {
                actionStepId = "dispatch-non-triage";
                matchedLabel = "dev-ready";
            }
            logDecision(decisionLoggingEnabled, "fallback-routing-evaluated", {
                issue: issueNumber,
                selected_deployment_id: actionDeploymentId,
                selected_step_id: actionStepId,
                matched_label: matchedLabel
            });
        }

        if (!actionStepId) {
            logDecision(decisionLoggingEnabled, "no-route-selected", {
                issue: issueNumber,
                labels: labels
            });
            context.setBody(JSON.stringify({
                routed: false,
                operation: "none",
                repo: repo,
                issue: issueNumber
            }));
            return;
        }

        var comments = fetchComments(repo, issueNumber, decisionLoggingEnabled);

        if (actionStepId === "dispatch-bmad-refine") {
            var refineRoutingConfig = resolveRefineRoutingConfig(matchedLabel);
            var refineResponse = sendAction(actionDeploymentId, actionStepId, {
                operation: "refine",
                workflow: refineRoutingConfig.workflow,
                model: refineRoutingConfig.model,
                repo: repo,
                issue: issueNumber,
                updated_at: eventPayload.updated_at || "",
                issue_url: eventPayload.issue_url || "",
                title: eventPayload.title || "",
                issue_body: eventPayload.issue_body || "",
                matched_label: matchedLabel,
                comments: comments,
                issue_context: eventPayload.issue_context || {},
                reason: "criteria-match:" + (matchedLabel || "unknown")
            });
            var refineBody = parseJson(refineResponse ? refineResponse.getBody() : "", {});
            if (isDispatchFailure(refineBody)) {
                logDecision(decisionLoggingEnabled, "dispatch-failed-refine", {
                    issue: issueNumber,
                    deployment_id: actionDeploymentId,
                    step_id: actionStepId,
                    response: refineBody
                });
                context.setBody(JSON.stringify({
                    routed: false,
                    action_deployment_id: actionDeploymentId,
                    action_step_id: actionStepId,
                    operation: "refine",
                    repo: repo,
                    issue: issueNumber,
                    error: "downstream-dispatch-failed",
                    response: refineBody
                }));
                return;
            }
            logDecision(decisionLoggingEnabled, "dispatched-refine", {
                issue: issueNumber,
                deployment_id: actionDeploymentId,
                step_id: actionStepId,
                comments_count: comments.length
            });

            context.setBody(JSON.stringify({
                routed: true,
                action_deployment_id: actionDeploymentId,
                action_step_id: actionStepId,
                operation: "refine",
            repo: repo,
            issue: issueNumber
        }));
        return;
    }

        if (actionStepId === "dispatch-bmad-develop") {
            var issueAuthor = eventPayload.issue_context && eventPayload.issue_context.user && eventPayload.issue_context.user.login;
            var approvalGranted = isAuthorApprovalGranted(comments, issueAuthor);
            var baseBranch = extractLastBaseBranch(eventPayload.issue_body || "", comments);
            var missingApproval = !approvalGranted;
            var missingBaseBranch = !String(baseBranch || "").trim();
            if (missingApproval || missingBaseBranch) {
                if (!hasDevelopPrereqReminder(comments)) {
                    var reminderDeploymentId = String(data.issueUpdaterDeploymentAccessId || "github-issue-updater").trim();
                    var reminderStepId = String(data.issueUpdaterAddCommentStepId || "github-issue-add-comment").trim();
                    if (reminderStepId) {
                        var required = [];
                        if (missingBaseBranch) required.push("`base_branch=<branch>` comment");
                        if (missingApproval) required.push("author approval comment (e.g. `LGTM`)");
                        try {
                            sendAction(reminderDeploymentId, reminderStepId, {
                                repo: repo,
                                issue: issueNumber,
                                comment: [
                                    "Development is waiting on prerequisites.",
                                    "",
                                    "Required before dispatch:",
                                    "- " + required.join("\n- ")
                                ].join("\n")
                            });
                            logDecision(decisionLoggingEnabled, "develop-prereq-reminder-posted", {
                                issue: issueNumber,
                                missing_approval: missingApproval,
                                missing_base_branch: missingBaseBranch
                            });
                        } catch (reminderErr) {
                            logDecision(decisionLoggingEnabled, "develop-prereq-reminder-failed", {
                                issue: issueNumber,
                                error: String(reminderErr && reminderErr.message ? reminderErr.message : reminderErr)
                            });
                        }
                    }
                }
                logDecision(decisionLoggingEnabled, "author-approval-required", {
                    issue: issueNumber,
                    author: issueAuthor || "",
                    comments_count: comments.length,
                    missing_approval: missingApproval,
                    missing_base_branch: missingBaseBranch
                });
                context.setBody(JSON.stringify({
                    routed: false,
                    action_deployment_id: actionDeploymentId,
                    action_step_id: actionStepId,
                    operation: "develop",
                    repo: repo,
                    issue: issueNumber,
                    error: missingBaseBranch ? "develop-prerequisites-missing" : "author-approval-required"
                }));
                return;
            }
            var developRoutingConfig = resolveDevelopRoutingConfig();
            var developResponse = sendAction(actionDeploymentId, actionStepId, {
                operation: "develop",
                workflow: developRoutingConfig.workflow,
                model: developRoutingConfig.model,
                repo: repo,
                issue: issueNumber,
                updated_at: eventPayload.updated_at || "",
                issue_url: eventPayload.issue_url || "",
                title: eventPayload.title || "",
                issue_body: eventPayload.issue_body || "",
                matched_label: matchedLabel,
                comments: comments,
                issue_context: eventPayload.issue_context || {},
                reason: "criteria-match:" + (matchedLabel || "unknown")
            });
            var developBody = parseJson(developResponse ? developResponse.getBody() : "", {});
            if (isDispatchFailure(developBody)) {
                logDecision(decisionLoggingEnabled, "dispatch-failed-develop", {
                    issue: issueNumber,
                    deployment_id: actionDeploymentId,
                    step_id: actionStepId,
                    response: developBody
                });
                context.setBody(JSON.stringify({
                    routed: false,
                    action_deployment_id: actionDeploymentId,
                    action_step_id: actionStepId,
                    operation: "develop",
                    repo: repo,
                    issue: issueNumber,
                    error: "downstream-dispatch-failed",
                    response: developBody
                }));
                return;
            }
            context.setBody(JSON.stringify({
                routed: true,
                action_deployment_id: actionDeploymentId,
                action_step_id: actionStepId,
                operation: "develop",
                repo: repo,
                issue: issueNumber
            }));
            return;
        }

        var nonTriagePayload = {
            operation: matchedLabel || "none",
            repo: repo,
            issue: issueNumber,
            issue_url: eventPayload.issue_url || "",
            title: eventPayload.title || "",
            issue_body: eventPayload.issue_body || "",
            comments: comments,
            issue_context: eventPayload.issue_context || {},
            labels: labels,
            action_deployment_id: actionDeploymentId,
            action_step_id: actionStepId
        };

        var nonTriageResponse = sendAction(actionDeploymentId, actionStepId, nonTriagePayload);
        var nonTriageBody = parseJson(nonTriageResponse ? nonTriageResponse.getBody() : "", {});
        if (isDispatchFailure(nonTriageBody)) {
            logDecision(decisionLoggingEnabled, "dispatch-failed-non-triage", {
                issue: issueNumber,
                deployment_id: actionDeploymentId,
                step_id: actionStepId,
                response: nonTriageBody
            });
            context.setBody(JSON.stringify({
                routed: false,
                action_deployment_id: actionDeploymentId,
                action_step_id: actionStepId,
                operation: nonTriagePayload.operation,
                repo: repo,
                issue: issueNumber,
                error: "downstream-dispatch-failed",
                response: nonTriageBody
            }));
            return;
        }
        logDecision(decisionLoggingEnabled, "dispatched-non-triage", {
            issue: issueNumber,
            deployment_id: actionDeploymentId,
            step_id: actionStepId,
            operation: nonTriagePayload.operation,
            comments_count: comments.length
        });

        context.setBody(JSON.stringify({
            routed: true,
            action_deployment_id: actionDeploymentId,
            action_step_id: actionStepId,
            operation: nonTriagePayload.operation,
            repo: repo,
            issue: issueNumber
        }));
    });
