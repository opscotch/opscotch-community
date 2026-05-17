doc
    .description("Normalize GitHub Actions list-workflow-runs response")
    .asUserErrors()
    .inSchema({
        type: "object",
        description: "GitHub API response for listing workflow runs",
        required: ["total_count", "workflow_runs"],
        properties: {
            total_count: { type: "integer", description: "Total number of workflow runs" },
            workflow_runs: {
                type: "array",
                description: "Array of workflow run objects",
                items: {
                    type: "object",
                    required: ["id", "run_number", "status", "html_url"],
                    properties: {
                        id: { type: "integer", description: "Unique identifier of the workflow run" },
                        run_number: { type: "integer", description: "Sequential run number for the workflow" },
                        status: {
                            type: "string",
                            description: "Current status of the run",
                            enum: ["queued", "in_progress", "completed"]
                        },
                        conclusion: { type: ["string", "null"], description: "Conclusion of the run; null when not completed" },
                        event: { type: "string", description: "Event that triggered the run" },
                        head_branch: { type: "string", description: "Branch the run was triggered from" },
                        created_at: { type: "string", description: "Timestamp when run was created" },
                        updated_at: { type: "string", description: "Timestamp when run was last updated" },
                        html_url: { type: "string", description: "URL to view the run in GitHub" }
                    }
                }
            }
        }
    })
    .outSchema({
        type: "object",
        description: "Normalized list workflow runs response",
        required: ["status", "operation", "total_count", "runs"],
        properties: {
            status: { type: "string", description: "Operation status" },
            operation: { type: "string", description: "Operation name" },
            repo: { type: "string", description: "Owner/repo format" },
            status_code: { type: "string", description: "HTTP status code" },
            total_count: { type: "integer", description: "Total number of workflow runs" },
            runs: {
                type: "array",
                description: "Normalized workflow runs",
                items: {
                    type: "object",
                    required: ["id", "run_number", "status", "html_url"],
                    properties: {
                        id: { type: "integer", description: "Unique identifier of the workflow run" },
                        run_number: { type: "integer", description: "Sequential run number for the workflow" },
                        status: {
                            type: "string",
                            description: "Current status of the run",
                            enum: ["queued", "in_progress", "completed"]
                        },
                        conclusion: { type: ["string", "null"], description: "Conclusion of the run; null when not completed" },
                        event: { type: "string", description: "Event that triggered the run" },
                        head_branch: { type: "string", description: "Branch the run was triggered from" },
                        created_at: { type: "string", description: "Timestamp when run was created" },
                        updated_at: { type: "string", description: "Timestamp when run was last updated" },
                        html_url: { type: "string", description: "URL to view the run in GitHub" }
                    }
                }
            }
        }
    })
    .run(() => {
        var body = context.getBody();
        var parsed = JSON.parse(body);

        var out = {
            status: "ok",
            operation: "list-workflow-runs"
        };

        out.total_count = parsed.total_count;
        out.runs = parsed.workflow_runs.map((run) => ({
            id: run.id,
            run_number: run.run_number,
            status: run.status,
            conclusion: run.conclusion,
            event: run.event,
            head_branch: run.head_branch,
            created_at: run.created_at,
            updated_at: run.updated_at,
            html_url: run.html_url
        }));

        context.setBody(JSON.stringify(out));
    });
