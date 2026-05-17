doc
    .description("Resolve failing step metadata for a run, then fetch sliced logs for that step")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo", "run_id", "log_fetch_deployment_access_id", "log_fetch_step_id"],
        properties: {
            repo: { type: "string", description: "Owner/repo format" },
            run_id: { type: "number", description: "Workflow run id" },
            log_fetch_deployment_access_id: { type: "string", description: "Deployment access id for external log-fetch step" },
            log_fetch_step_id: { type: "string", description: "Step id for external log-fetch step" }
        }
    })
    .outSchema({
        type: "object",
        required: ["status", "operation"],
        properties: {
            status: { type: "string" },
            operation: { type: "string" },
            repo: { type: "string" },
            run_id: { type: "number" },
            failing_step: { type: "object" },
            step_log_lines: {
                type: "array",
                items: {
                    type: "object",
                    required: ["log", "line_number", "milliseconds_since_first_true_log"],
                    properties: {
                        log: { type: "string" },
                        line_number: { type: "number" },
                        milliseconds_since_first_true_log: { type: "number" }
                    }
                }
            },
            synthetic_summary: { type: "string" },
            exit_code: { type: "number" }
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

        var body = JSON.parse(context.getBody());
        var repo = body.repo;
        var runId = body.run_id;
        var logFetchDeploymentAccessId = body.log_fetch_deployment_access_id;
        var logFetchStepId = body.log_fetch_step_id;

        var failingStepResponse = context.sendToStep("github-action-get-failing-step", JSON.stringify({
            operation: "get-failing-step",
            repo: repo,
            run_id: runId
        }));
        var failingStepBody = parseStepBodyStrict(failingStepResponse, "github-action-get-failing-step");

        var stepLogsResponse = context.sendToStep("github-action-get-step-logs", JSON.stringify({
            repo: repo,
            run_id: runId,
            job_id: failingStepBody.job_id,
            step_name: failingStepBody.failing_step_name,
            step_number: failingStepBody.failing_step_number,
            step_started_at: failingStepBody.failing_step_started_at,
            step_completed_at: failingStepBody.failing_step_completed_at,
            log_fetch_deployment_access_id: logFetchDeploymentAccessId,
            log_fetch_step_id: logFetchStepId
        }));
        var stepLogsBody = parseStepBodyStrict(stepLogsResponse, "github-action-get-step-logs");

        context.setBody(assertString(JSON.stringify({
            status: "ok",
            operation: "get-failing-step-logs",
            repo: repo,
            run_id: runId,
            failing_step: {
                job_id: failingStepBody.job_id,
                job_name: failingStepBody.job_name,
                step_name: failingStepBody.failing_step_name,
                step_number: failingStepBody.failing_step_number,
                step_started_at: failingStepBody.failing_step_started_at,
                step_completed_at: failingStepBody.failing_step_completed_at
            },
            step_log_lines: stepLogsBody.step_log_lines,
            synthetic_summary: stepLogsBody.synthetic_summary,
            exit_code: stepLogsBody.exit_code
        })));
    });
