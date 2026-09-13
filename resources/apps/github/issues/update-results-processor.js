doc
    .description("Normalize successful GitHub issue updater response")
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

        var responseBody = context.getBody() || "";
        var operation = String(context.getProperty("issue_operation") || "");
        var repo = String(context.getProperty("issue_repo") || "");
        var issue = parseInt(String(context.getProperty("issue_number") || "0"), 10);
        var statusCode = String(context.getProperty("status_code") || "200");

        context.sendMetric(context.getTimestamp(), "github.update.success", 1.0, {
            operation: operation,
            repo: repo,
            issue_or_pr: String(issue),
            status_code: statusCode
        });

        context.setBody(JSON.stringify({
            status: "ok",
            operation: operation,
            repo: repo,
            issue: issue,
            status_code: statusCode,
            response: tryParseJson(responseBody)
        }));
    });
