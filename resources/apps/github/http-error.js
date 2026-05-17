doc
    .description("Handle HTTP errors for GitHub/OpenClaw steps using a data-configured error kind")
    .asUserErrors()
    .dataSchema({
        type: "object",
        required: ["httpErrorKind"],
        additionalProperties: true,
        properties: {
            httpErrorKind: {
                description: "Distinguishes which HTTP error shape/message to emit.",
                type: "string"
            }
        }
    })
    .run(() => {
        var kind = context.getData("httpErrorKind").trim();
        var statusCode = String(context.getProperty("status_code") || "unknown");
        var responseBody = context.getBody() || "";
        var result = {
            systemError: "HTTP request failed with status " + statusCode,
            body: {
                status: "error",
                status_code: statusCode,
                response: responseBody
            }
        };

        if (kind === "github-poll") {
            result.systemError = "GitHub polling request failed with status " + statusCode;
        } else if (kind === "github-update") {
            result.systemError = "GitHub issue update request failed with status " + statusCode;
        } else if (kind === "github-actions") {
            result.systemError = "GitHub actions request failed with status " + statusCode;
        } else if (kind === "github-fetch-comments") {
            result.systemError = "GitHub issue comments request failed with status " + statusCode;
            result.body.comments = [];
            result.body.comments_count = 0;
        } else if (kind === "openclaw-reviewer") {
            result.systemError = "OpenClaw reviewer invoke failed with status " + statusCode;
            result.body = {
                queued: false,
                status_code: statusCode,
                response: responseBody
            };
            if (typeof context.diagnosticLog === "function") {
                context.diagnosticLog("openclaw invoke error response: " + JSON.stringify({
                    status_code: statusCode,
                    response: responseBody
                }));
            } else {
                console.log("openclaw invoke error response: " + JSON.stringify({
                    status_code: statusCode,
                    response: responseBody
                }));
            }
        } else {
            result.body.handler_kind = kind;
        }

        context.addSystemError(result.systemError);
        context.setBody(JSON.stringify(result.body));
    });
