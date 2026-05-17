doc
    .description("Normalize GitHub Actions get-workflow-run response")
    .asUserErrors()
    .inSchema({
        type: "object",
        description: "GitHub API response for getting a workflow run",
        required: ["id", "run_number", "workflow_id", "status", "html_url"],
        properties: {
            id: { type: "integer", description: "Unique identifier of the workflow run" },
            run_number: { type: "integer", description: "Sequential run number for the workflow in this repo" },
            workflow_id: { type: "integer", description: "ID of the parent workflow" },
            status: {
                type: "string",
                description: "Current status of the run",
                enum: ["queued", "in_progress", "completed"]
            },
            conclusion: {
                type: "string",
                description: "Conclusion of the run (null if not completed)"
            },
            html_url: { type: "string", description: "URL to view the run in GitHub" }
            ,
            logs_url: { type: "string", description: "API URL to fetch logs for the run" }
        }
    })
    .outSchema({
        type: "object",
        description: "Normalized workflow run data",
        required: ["status", "operation"],
        properties: {
            status: { type: "string", description: "Operation status" },
            operation: { type: "string", description: "Operation name" },
            repo: { type: "string", description: "Owner/repo format" },
            status_code: { type: "string", description: "HTTP status code" },
            run_id: { type: "integer", description: "Unique identifier of the workflow run" },
            run_number: { type: "integer", description: "Sequential run number for the workflow" },
            workflow_id: { type: "integer", description: "ID of the parent workflow" },
            run_status: {
                type: "string",
                description: "Current status of the run",
                enum: ["queued", "in_progress", "completed"]
            },
            run_conclusion: {
                type: "string",
                description: "Conclusion of the run"
            },
            completed: { type: "boolean", description: "Whether the run has completed" },
            success: { type: "boolean", description: "Whether the run succeeded" },
            html_url: { type: "string", description: "URL to view the run in GitHub" },
            logs_url: { type: "string", description: "API URL to fetch logs for the run" }
        }
    })
    .run(() => {
        var body = context.getBody();
        var parsed = JSON.parse(body);

        var out = {
            status: "ok",
            operation: "get-workflow-run"
        };

        out.run_id = parsed.id;
        out.run_number = parsed.run_number;
        out.workflow_id = parsed.workflow_id;
        out.run_status = parsed.status;
        out.run_conclusion = parsed.conclusion;
        out.completed = parsed.status === "completed";
        out.success = parsed.conclusion === "success";
        out.html_url = parsed.html_url;
        out.logs_url = parsed.logs_url ?? "";

        context.setBody(JSON.stringify(out));
    });
