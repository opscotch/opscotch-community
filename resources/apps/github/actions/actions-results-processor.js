doc
    .description("Normalize GitHub Actions trigger workflow_dispatch response")
    .asUserErrors()
    .inSchema({
        type: "object",
        description: "GitHub API response for workflow_dispatch trigger",
        required: ["workflow_run_id", "run_url", "html_url"],
        properties: {
            workflow_run_id: { type: "integer", description: "ID of the triggered workflow run" },
            run_url: { type: "string", description: "URL to the run resource" },
            html_url: { type: "string", description: "URL to view the run in GitHub" }
        }
    })
    .outSchema({
        type: "object",
        description: "Normalized workflow dispatch trigger response",
        required: ["status", "operation"],
        properties: {
            status: { type: "string", description: "Operation status" },
            operation: { type: "string", description: "Operation name" },
            repo: { type: "string", description: "Owner/repo format" },
            status_code: { type: "string", description: "HTTP status code" },
            workflow_run_id: { type: "integer", description: "ID of the triggered workflow run" },
            run_url: { type: "string", description: "URL to the run resource" },
            html_url: { type: "string", description: "URL to view the run in GitHub" }
        }
    })
    .run(() => {
        var body = context.getBody();
        var parsed = JSON.parse(body);

        var out = {
            status: "ok",
            operation: "trigger-workflow"
        };

        out.workflow_run_id = parsed.workflow_run_id;
        out.run_url = parsed.run_url;
        out.html_url = parsed.html_url;

        context.setBody(JSON.stringify(out));
    });
