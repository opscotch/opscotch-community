doc
    .description("Normalize GitHub Actions responses for trigger and run polling operations")
    .asUserErrors()
    .run(() => {
        function tryParseJson(value) {
            if (value === null || value === undefined || value === "") {
                return null;
            }
            try {
                return JSON.parse(value);
            } catch (e) {
                return value;
            }
        }

        var operation = String(context.getProperty("gh_action_operation") || "");
        var repo = String(context.getProperty("gh_action_repo") || "");
        var statusCode = String(context.getProperty("status_code") || "200");
        var parsed = tryParseJson(context.getBody() || "");

        var out = {
            status: "ok",
            operation: operation,
            repo: repo,
            status_code: statusCode,
            response: parsed
        };

        if (operation === "get-workflow-run" && parsed && typeof parsed === "object") {
            out.run_id = parsed.id || null;
            out.run_number = parsed.run_number || null;
            out.workflow_id = parsed.workflow_id || null;
            out.run_status = parsed.status || null;
            out.run_conclusion = parsed.conclusion || null;
            out.completed = parsed.status === "completed";
            out.success = parsed.conclusion === "success";
            out.html_url = parsed.html_url || null;
        }

        if (operation === "list-workflow-runs" && parsed && typeof parsed === "object") {
            var runs = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : [];
            out.total_count = parsed.total_count || runs.length;
            out.runs = runs.map((run) => ({
                id: run.id || null,
                run_number: run.run_number || null,
                status: run.status || null,
                conclusion: run.conclusion || null,
                event: run.event || null,
                head_branch: run.head_branch || null,
                created_at: run.created_at || null,
                updated_at: run.updated_at || null,
                html_url: run.html_url || null
            }));
        }

        context.setBody(JSON.stringify(out));
    });
