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

        context.setBody(JSON.stringify({
            status: "ok",
            operation: String(context.getProperty("issue_operation") || ""),
            repo: String(context.getProperty("issue_repo") || ""),
            issue: parseInt(String(context.getProperty("issue_number") || "0"), 10),
            status_code: String(context.getProperty("status_code") || "200"),
            response: tryParseJson(responseBody)
        }));
    });
