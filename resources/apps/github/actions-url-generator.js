doc
    .description("Resolve GitHub Actions URL and HTTP method from operation payload")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["repo"],
        additionalProperties: true,
        properties: {
            operation: { type: "string" },
            repo: { type: "string" },
            workflow_id: {
                oneOf: [{ type: "string" }, { type: "number" }]
            },
            run_id: {
                oneOf: [{ type: "string" }, { type: "number" }]
            },
            ref: { type: "string" },
            branch: { type: "string" },
            per_page: {
                oneOf: [{ type: "string" }, { type: "number" }]
            },
            event: { type: "string" }
        }
    })
    .dataSchema({
        type: "object",
        additionalProperties: true,
        properties: {
            hostId: { type: "string" },
            operation: { type: "string" }
        }
    })
    .run(() => {
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

        function normalizePositiveInt(name, value) {
            var number = parseInt(String(value), 10);
            if (isNaN(number) || number <= 0) {
                throw new Error(name + " must be a positive integer");
            }
            return number;
        }

        var data = parseJson(context.getData(), {});
        var hostId = String(data.hostId || "github-api").trim() || "github-api";
        var input = parseJson(context.getBody(), {});

        var operation = String(input.operation || data.operation || "").trim();
        var repo = normalizeRepo(input.repo);
        var method;
        var path;

        if (operation === "trigger-workflow") {
            var workflowId = String(input.workflow_id || "").trim();
            var ref = String(input.ref || "").trim();
            if (!workflowId) {
                throw new Error("workflow_id is required for trigger-workflow operation");
            }
            if (!ref) {
                throw new Error("ref is required for trigger-workflow operation");
            }
            method = "POST";
            path = "/repos/" + repo + "/actions/workflows/" + encodeURIComponent(workflowId) + "/dispatches";
        } else if (operation === "list-workflow-runs") {
            var listWorkflowId = String(input.workflow_id || "").trim();
            if (!listWorkflowId) {
                throw new Error("workflow_id is required for list-workflow-runs operation");
            }

            var params = [];
            var event = String(input.event || "workflow_dispatch").trim();
            var branch = String(input.branch || "").trim();
            var perPage = input.per_page === undefined ? 20 : normalizePositiveInt("per_page", input.per_page);

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
            var runId = normalizePositiveInt("run_id", input.run_id);
            method = "GET";
            path = "/repos/" + repo + "/actions/runs/" + runId;
        } else {
            throw new Error("unsupported operation: " + operation);
        }

        context.setHttpMethod(method);
        context.setUrl(hostId, path);
        context.setHeader("Accept", "application/vnd.github+json");
        context.setHeader("X-GitHub-Api-Version", "2022-11-28");

        context.setProperty("gh_action_operation", operation);
        context.setProperty("gh_action_repo", repo);
    });
