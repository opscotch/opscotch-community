doc
    .description("Resolve GitHub Actions URL and HTTP method from operation payload")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo"],
        properties: {
            repo: { type: "string", description: "Owner/repo format" },
            workflow_id: { type: "string", description: "Required for trigger-workflow, list-workflow-runs" },
            run_id: { type: "number", description: "Required for get-workflow-run, get-failing-step" },
            job_id: { type: "number", description: "Required for get-workflow-job-logs" },
            ref: { type: "string", description: "Required for trigger-workflow" },
            branch: { type: "string", description: "Filter runs by branch" },
            per_page: { type: "number", description: "Results per page" },
            event: { type: "string", enum: ["workflow_dispatch", "schedule"] }
        }
    })
    .dataSchema({
        type: "object",
        required : [ "hostId", "operation" ],
        properties: {
            hostId: { type: "string" },
            operation: { type: "string", enum: ["trigger-workflow", "list-workflow-runs", "get-workflow-run", "get-failing-step", "get-workflow-job-logs"], description: "Operation to perform" }
        }
    })
    .run(() => {
        function debugLog(event, payload) {
            try {
                console.log("[actions-url-generator] " + event + " " + JSON.stringify(payload || {}));
            } catch (ignoreDebugLogFailure) {
            }
        }

        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        function normalizeRepo(value) {
            var repo = String(value || "").trim();
            if (!repo || repo.indexOf("/") === -1) {
                throw new Error("repo must be in owner/repo format");
            }
            return repo;
        }

        var data = JSON.parse(context.getData());
        var hostId = data.hostId;
        var input = parseJson(context.getBody(), {});

        var operation = data.operation;
        var repo = normalizeRepo(input.repo);
        var method;
        var path;
        debugLog("request", {
            operation: operation,
            repo: repo,
            host_id: hostId,
            input_keys: Object.keys(input || {})
        });

        if (operation === "trigger-workflow") {
            var workflowId = input.workflow_id;
            var ref = input.ref;
            if (!workflowId) {
                throw new Error("workflow_id is required for trigger-workflow operation");
            }
            if (!ref) {
                throw new Error("ref is required for trigger-workflow operation");
            }
            method = "POST";
            path = "/repos/" + repo + "/actions/workflows/" + encodeURIComponent(workflowId) + "/dispatches";
        } else if (operation === "list-workflow-runs") {
            var listWorkflowId = input.workflow_id;
            if (!listWorkflowId) {
                throw new Error("workflow_id is required for list-workflow-runs operation");
            }

            var params = [];
            var event = input.event || "workflow_dispatch";
            var branch = input.branch;
            var perPage = input.per_page ?? 20;

            params.push("per_page=" + encodeURIComponent(String(perPage)));
            if (event) {
                params.push("event=" + encodeURIComponent(event));
            }
            if (branch) {
                params.push("branch=" + encodeURIComponent(branch));
            }

            method = "GET";
            path = "/repos/" + repo + "/actions/workflows/" + encodeURIComponent(listWorkflowId) + "/runs?" + params.join("&");
        } else if (operation === "get-workflow-run") {
            var runId = input.run_id;
            if (!runId || runId <= 0) throw new Error("run_id must be a positive integer");
            method = "GET";
            path = "/repos/" + repo + "/actions/runs/" + runId;
        } else if (operation === "get-failing-step") {
            var failingRunId = input.run_id;
            if (!failingRunId || failingRunId <= 0) throw new Error("run_id must be a positive integer");
            var jobsPerPage = input.per_page ?? 100;
            method = "GET";
            path = "/repos/" + repo + "/actions/runs/" + failingRunId + "/jobs?per_page=" + jobsPerPage;
            context.setProperty("gh_action_run_id", String(failingRunId));
        } else if (operation === "get-workflow-job-logs") {
            var logsJobId = input.job_id;
            if (!logsJobId || logsJobId <= 0) throw new Error("job_id must be a positive integer");
            method = "GET";
            path = "/repos/" + repo + "/actions/jobs/" + logsJobId + "/logs";
            context.setProperty("gh_action_job_id", String(logsJobId));
        } else {
            // Schema enum handles invalid operations
            method = "GET";
            path = "/repos/" + repo + "/actions";
        }

        context.setHttpMethod(method);
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2026-03-10");

        context.setProperty("gh_action_operation", operation);
        context.setProperty("gh_action_repo", repo);
        debugLog("resolved", {
            operation: operation,
            method: method,
            path: path,
            host_id: hostId,
            accept: "application/vnd.github+json",
            run_id: context.getProperty("gh_action_run_id") || null,
            job_id: context.getProperty("gh_action_job_id") || null
        });
    });
