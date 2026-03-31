doc
    .description("Resolves a registered MCP tool and dispatches to the configured sibling callback")
    .inSchema({
        type: "object",
        required: ["jsonrpc", "id", "method"],
        properties: {
            jsonrpc: { type: "string" },
            id: {},
            method: { type: "string" },
            params: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    arguments: { type: "object" }
                }
            }
        }
    })
    .outSchema({
        type: "object",
        required: ["ok"],
        properties: {
            ok: { type: "boolean" },
            result: { type: "object" },
            error: { type: "object" }
        }
    })
    .run(() => {
        function callbackError(returnedContext) {
            var message = returnedContext.getFirstError(returnedContext.getAllErrors());

            return {
                ok: false,
                error: {
                    code: -32603,
                    message: message == null || message === "" ? "Tool callback failed" : "" + message
                }
            };
        }

        function normalizeToolResult(body, statusCode) {
            var parsed;
            var isJson = false;
            var result;

            try {
                parsed = JSON.parse(body);
                isJson = true;
            } catch (e) {
                parsed = body;
            }

            if (isJson && parsed != null && typeof parsed === "object" && Array.isArray(parsed.content)) {
                result = parsed;
            } else if (isJson && parsed != null && typeof parsed === "object" && Array.isArray(parsed.contents)) {
                result = {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(parsed)
                        }
                    ],
                    structuredContent: parsed
                };
            } else if (isJson && parsed != null && typeof parsed === "object") {
                result = {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(parsed)
                        }
                    ],
                    structuredContent: parsed
                };
            } else if (parsed == null || parsed === "") {
                result = {
                    content: []
                };
            } else {
                result = {
                    content: [
                        {
                            type: "text",
                            text: "" + parsed
                        }
                    ]
                };
            }

            if (statusCode != null && statusCode >= 400) {
                result.isError = true;
            }

            return result;
        }

        try {
            var request = JSON.parse(context.getPassedMessageAsString());
            var params = request.params == null ? {} : request.params;
            var toolName = params.name;
            var toolLookup = JSON.parse(
                context.sendToStep("registry", JSON.stringify({
                    action: "get-tool",
                    name: toolName
                })).getBody()
            );

            if (toolLookup.ok !== true) {
                context.setBody(JSON.stringify(toolLookup));
            } else {
                var tool = toolLookup.result.tool;
                var callbackPayload = {
                    name: tool.name,
                    namespace: tool.namespace,
                    arguments: params.arguments == null ? {} : params.arguments,
                    tool: tool
                };
                var returnedContext = context.sendToStep(
                    tool.handler.deploymentAccessId,
                    tool.handler.stepId,
                    JSON.stringify(callbackPayload)
                );

                if (returnedContext.isErrored()) {
                    context.setBody(JSON.stringify(callbackError(returnedContext)));
                    return;
                }

                var statusCode = returnedContext.getProperty("status_code");
                var parsedStatusCode = statusCode == null ? null : parseInt("" + statusCode, 10);

                context.setBody(JSON.stringify({
                    ok: true,
                    result: normalizeToolResult(returnedContext.getBody(), parsedStatusCode)
                }));
            }
        } catch (e) {
            context.setBody(JSON.stringify({
                ok: false,
                error: {
                    code: -32603,
                    message: e.message
                }
            }));
        }
    });
