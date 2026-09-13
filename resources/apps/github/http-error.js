doc
    .description("Handle HTTP errors for GitHub/OpenClaw steps using a data-configured error kind")
    .asUserErrors()
    .dataSchema({
        type: "object",
        required: ["httpErrorKind"],
        additionalProperties: true,
        properties: {
            httpErrorKind: {
                description: "Distinguishes which HTTP error shape/message to emit.",
                type: "string"
            }
        }
    })
    .run(() => {
        var kind = context.getData("httpErrorKind").trim();
        var statusCode = String(context.getProperty("status_code") || "unknown");
        var responseBody = context.getBody() || "";
        var responseSnippet = String(responseBody || "").trim();
        if (responseSnippet.length > 200) {
            responseSnippet = responseSnippet.slice(0, 200) + "...";
        }
        var pollGroup = null;
        try {
            pollGroup = JSON.parse(context.getProperty("gh_poll_group") || "null");
        } catch (e) {
            pollGroup = null;
        }

        var result = {
            systemError: "HTTP request failed with status " + statusCode,
            body: {
                status: "error",
                status_code: statusCode,
                response: responseBody
            }
        };

        if (kind === "github-poll") {
            result.systemError = "GitHub polling request failed with status " + statusCode + (responseSnippet ? ": " + responseSnippet : "");
        } else if (kind === "github-update") {
            result.systemError = "GitHub issue update request failed with status " + statusCode + (responseSnippet ? ": " + responseSnippet : "");
        } else if (kind === "github-actions") {
            result.systemError = "GitHub actions request failed with status " + statusCode + (responseSnippet ? ": " + responseSnippet : "");
        } else if (kind === "github-fetch-comments") {
            result.systemError = "GitHub issue comments request failed with status " + statusCode + (responseSnippet ? ": " + responseSnippet : "");
            result.body.comments = [];
            result.body.comments_count = 0;
        } else if (kind === "openclaw-reviewer" || kind === "cli-sidecar-reviewer") {
            var reviewerName = kind === "cli-sidecar-reviewer" ? "CLI sidecar reviewer" : "OpenClaw reviewer";
            var reviewerCode = kind === "cli-sidecar-reviewer" ? "cli_sidecar_invoke_failed" : "openclaw_invoke_failed";
            result.systemError = reviewerName + " invoke failed with status " + statusCode + (responseSnippet ? ": " + responseSnippet : "");
            result.body = {
                queued: false,
                status: "error",
                status_code: statusCode,
                response: responseBody,
                error: {
                    code: reviewerCode,
                    message: result.systemError,
                    retryable: true
                }
            };
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog("reviewer invoke error response: " + JSON.stringify({
                    kind: kind,
                    status_code: statusCode,
                    response: responseBody
                }));
            }
        } else {
            result.body.handler_kind = kind;
        }

        if (pollGroup && pollGroup.repo && pollGroup.assignee && pollGroup.watchEntity && Array.isArray(pollGroup.criteria)) {
            result.body.repo = pollGroup.repo;
            result.body.assignee = pollGroup.assignee;
            result.body.watchEntity = pollGroup.watchEntity;
            result.body.criteria = pollGroup.criteria;
            result.body.items = [];
        }

        result.body.errors = [{
            systemError: result.systemError,
            status_code: statusCode,
            response: responseBody,
            httpErrorKind: kind
        }];

        var metricGroup = "http";
        if (kind === "github-poll") {
            metricGroup = "poll";
        } else if (kind === "github-update") {
            metricGroup = "update";
        } else if (kind === "github-actions") {
            metricGroup = "actions";
        } else if (kind === "github-fetch-comments") {
            metricGroup = "comments";
        }
        var meta = {
            error: "true",
            kind: kind,
            status_code: statusCode
        };
        if (pollGroup && pollGroup.repo) {
            meta.repo = String(pollGroup.repo);
        }
        if (pollGroup && pollGroup.watchEntity) {
            meta.watch_entity = String(pollGroup.watchEntity);
        }
        context.sendMetric(context.getTimestamp(), "github.http.error", 1.0, meta);
        context.sendMetric(context.getTimestamp(), "github." + metricGroup + ".errors", 1.0, meta);
        if (kind === "github-poll") {
            context.sendMetric(context.getTimestamp(), "github.poll.failure", 1.0, meta);
        } else if (kind === "github-update") {
            context.sendMetric(context.getTimestamp(), "github.update.failure", 1.0, meta);
        } else if (kind === "github-actions") {
            context.sendMetric(context.getTimestamp(), "github.actions.failure", 1.0, meta);
        } else if (kind === "github-fetch-comments") {
            context.sendMetric(context.getTimestamp(), "github.comments.failure", 1.0, meta);
        }

        context.addSystemError(result.systemError);
        context.setBody(JSON.stringify(result.body));
    });
