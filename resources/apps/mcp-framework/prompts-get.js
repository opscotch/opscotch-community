doc
    .description("Returns a registered prompt, either from static content or a dynamic sibling callback")
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
            var userErrors = returnedContext.getUserErrors();
            var allErrors = returnedContext.getAllErrors();
            var message;

            if (userErrors.length > 0) {
                message = returnedContext.getFirstError(userErrors);

                return {
                    ok: false,
                    error: {
                        code: -32602,
                        message: message == null || message === "" ? "Prompt arguments were invalid" : "" + message,
                        data: {
                            userErrors: userErrors
                        }
                    }
                };
            }

            message = returnedContext.getFirstError(allErrors);

            return {
                ok: false,
                error: {
                    code: -32603,
                    message: message == null || message === "" ? "Prompt callback failed" : "" + message,
                    data: allErrors.length === 0 ? undefined : {
                        errors: allErrors
                    }
                }
            };
        }

        function normalizeStaticPrompt(prompt) {
            if (Array.isArray(prompt.source.messages)) {
                return {
                    description: prompt.description,
                    messages: prompt.source.messages
                };
            }

            return {
                description: prompt.description,
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: prompt.source.text == null ? "" : prompt.source.text
                        }
                    }
                ]
            };
        }

        function normalizeDynamicPrompt(prompt, body) {
            try {
                var parsed = JSON.parse(body);

                if (parsed != null && typeof parsed === "object" && Array.isArray(parsed.messages)) {
                    return parsed;
                }

                return {
                    description: prompt.description,
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: JSON.stringify(parsed)
                            }
                        }
                    ]
                };
            } catch (e) {
                return {
                    description: prompt.description,
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: body == null ? "" : "" + body
                            }
                        }
                    ]
                };
            }
        }

        try {
            var request = JSON.parse(context.getPassedMessageAsString());
            var params = request.params == null ? {} : request.params;
            var promptName = params.name;
            var promptLookup = JSON.parse(
                context.sendToStep("registry", JSON.stringify({
                    action: "get-prompt",
                    name: promptName
                })).getBody()
            );

            if (promptLookup.ok !== true) {
                context.setBody(JSON.stringify(promptLookup));
            } else {
                var prompt = promptLookup.result.prompt;

                if (prompt.source.type === "static") {
                    context.setBody(JSON.stringify({
                        ok: true,
                        result: normalizeStaticPrompt(prompt)
                    }));
                } else {
                    var callbackPayload = {
                        name: promptName,
                        arguments: params.arguments == null ? {} : params.arguments,
                        prompt: prompt
                    };
                    var returnedContext = context.sendToStep(
                        prompt.source.handler.deploymentAccessId,
                        prompt.source.handler.stepId,
                        JSON.stringify(callbackPayload)
                    );

                    if (returnedContext.isErrored()) {
                        context.setBody(JSON.stringify(callbackError(returnedContext)));
                        return;
                    }

                    context.setBody(JSON.stringify({
                        ok: true,
                        result: normalizeDynamicPrompt(prompt, returnedContext.getBody())
                    }));
                }
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
