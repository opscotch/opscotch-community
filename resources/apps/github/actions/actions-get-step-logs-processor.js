doc
    .description("Fetch and slice GitHub Actions logs for a specific step window")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: [
            "repo",
            "run_id",
            "job_id",
            "step_name",
            "step_started_at",
            "step_completed_at",
            "log_fetch_deployment_access_id",
            "log_fetch_step_id"
        ],
        properties: {
            repo: { type: "string", description: "Owner/repo format" },
            run_id: { type: "number", description: "Workflow run id" },
            job_id: { type: "number", description: "Workflow job id" },
            step_name: { type: "string", description: "GitHub step name" },
            step_number: { type: "number", description: "GitHub step number" },
            step_started_at: { type: "string", description: "Step start timestamp (ISO8601)" },
            step_completed_at: { type: "string", description: "Step completion timestamp (ISO8601)" },
            log_fetch_deployment_access_id: { type: "string", description: "Deployment access id for external log-fetch step" },
            log_fetch_step_id: { type: "string", description: "Step id for external log-fetch step" }
        }
    })
    .outSchema({
        type: "object",
        required: ["status", "operation", "repo", "run_id", "job_id", "step_name", "step_logs"],
        properties: {
            status: { type: "string" },
            operation: { type: "string" },
            repo: { type: "string" },
            run_id: { type: "number" },
            job_id: { type: "number" },
            step_name: { type: "string" },
            step_number: { type: "number" },
            step_started_at: { type: "string" },
            step_completed_at: { type: "string" },
            logs_redirect_url: { type: "string" },
            step_logs: { type: "string" }
        }
    })
    .run(() => {
        function assertString(value) {
            if (typeof value !== "string") {
                throw new Error("setBody expected string, received " + (value === null ? "null" : Array.isArray(value) ? "array" : typeof value));
            }
            return value;
        }

        function parseStepBodyStrict(response, sourceStepId) {
            var rawBody = response ? response.getBody() : "";
            if (rawBody === null || rawBody === undefined || rawBody === "") {
                return {};
            }
            if (typeof rawBody === "object") {
                throw new Error("Expected string body from " + sourceStepId + " but received object");
            }
            return JSON.parse(rawBody);
        }

        function parseIsoMillis(value, inclusiveSecondEnd) {
            var text = String(value);
            var ms = Date.parse(text);
            if (isNaN(ms)) return NaN;

            // GitHub step timestamps are often second-precision (no fractional part).
            // For completed_at, treat second-precision values as inclusive to end-of-second.
            if (inclusiveSecondEnd && !/\.\d+/.test(text)) {
                ms += 999;
            }
            return ms;
        }

        function sliceStepLogsByTimestamp(rawLogs, stepName, startedAt, completedAt) {
            var startMs = parseIsoMillis(startedAt, false);
            var endMs = parseIsoMillis(completedAt, true);
            if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
                return String(rawLogs);
            }

            var lines = String(rawLogs).split(/\r?\n/);
            var include = [];
            var inWindow = false;
            var tsRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;

            for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i];
                var match = line.match(tsRegex);
                if (match && match[1]) {
                    var lineMs = parseIsoMillis(match[1]);
                    if (!isNaN(lineMs)) {
                        if (lineMs < startMs) {
                            inWindow = false;
                        } else if (lineMs <= endMs) {
                            inWindow = true;
                        } else {
                            inWindow = false;
                            break;
                        }
                    }
                }
                if (inWindow) {
                    include.push(line);
                }
            }

            if (include.length === 0) {
                var marker = "Run " + stepName;
                var markerHits = lines.filter(function(line) {
                    return line.indexOf(marker) >= 0;
                });
                if (markerHits.length > 0) {
                    return markerHits.join("\n");
                }
                return "";
            }
            return include.join("\n");
        }

        var body = JSON.parse(context.getBody());
        var repo = body.repo;
        var runId = body.run_id;
        var jobId = body.job_id;
        var stepName = body.step_name;
        var stepNumber = body.step_number;
        var stepStartedAt = body.step_started_at;
        var stepCompletedAt = body.step_completed_at;
        var logFetchDeploymentAccessId = body.log_fetch_deployment_access_id;
        var logFetchStepId = body.log_fetch_step_id;

        var logsResponse = context.sendToStep("github-action-get-job-logs", JSON.stringify({
            operation: "get-workflow-job-logs",
            repo: repo,
            job_id: jobId
        }));
        var logsBody = parseStepBodyStrict(logsResponse, "github-action-get-job-logs");
        var redirectUrl = logsBody.redirect_location;

        var fetchedLogsResponse = context.sendToStep(logFetchDeploymentAccessId, logFetchStepId, JSON.stringify({
            repo: repo,
            run_id: runId
        }));
        var fetchedLogsBody = parseStepBodyStrict(fetchedLogsResponse, logFetchStepId);
        var logsText = fetchedLogsBody.logs;
        var slicedLogs = sliceStepLogsByTimestamp(logsText, stepName, stepStartedAt, stepCompletedAt);

        context.setBody(assertString(JSON.stringify({
            status: "ok",
            operation: "get-step-logs",
            repo: repo,
            run_id: runId,
            job_id: jobId,
            step_name: stepName,
            step_number: stepNumber,
            step_started_at: stepStartedAt,
            step_completed_at: stepCompletedAt,
            logs_redirect_url: redirectUrl,
            step_logs: slicedLogs
        })));
    });
