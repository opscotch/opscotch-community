doc
    .description("Normalize GitHub Actions workflow/job logs response (302 redirect expected)")
    .asUserErrors()
    .inSchema({
        type: "object",
        description: "Response body is typically empty for redirecting logs endpoint",
        additionalProperties: true
    })
    .outSchema({
        type: "object",
        required: ["status", "operation"],
        properties: {
            status: { type: "string", description: "Operation status" },
            operation: { type: "string", description: "Operation name" },
            logs_redirect_url: { type: "string", description: "Resolved redirect URL for downloadable logs" },
            has_redirect: { type: "boolean", description: "Whether a redirect URL was present" }
        }
    })
    .run(() => {
        function firstHeaderValue(name) {
            try {
                var raw = context.getHeader(name);
                if (!raw) return "";
                var values = JSON.parse(raw);
                if (!Array.isArray(values) || values.length === 0) return "";
                return String(values[0] ?? "");
            } catch (ignoreHeaderFailure) {
                return "";
            }
        }

        var location = firstHeaderValue("Location");

        context.setBody(JSON.stringify({
            status: "ok",
            operation: "get-workflow-job-logs",
            logs_redirect_url: location,
            has_redirect: !!location,
            redirect_location: location,
            redirect_handled: !!location
        }));
    });
