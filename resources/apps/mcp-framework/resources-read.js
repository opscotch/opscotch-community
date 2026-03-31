doc
    .description("Returns a registered MCP resource from static content or a dynamic sibling callback")
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
                    uri: { type: "string" }
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
                    message: message == null || message === "" ? "Resource callback failed" : "" + message
                }
            };
        }

        function normalizeStaticResource(resource) {
            if (Array.isArray(resource.source.contents)) {
                return {
                    contents: resource.source.contents
                };
            }

            return {
                contents: [
                    {
                        uri: resource.uri,
                        mimeType: resource.mimeType,
                        text: resource.source.text == null ? "" : resource.source.text
                    }
                ]
            };
        }

        function normalizeDynamicResource(resource, body) {
            try {
                var parsed = JSON.parse(body);

                if (parsed != null && typeof parsed === "object" && Array.isArray(parsed.contents)) {
                    return parsed;
                }

                return {
                    contents: [
                        {
                            uri: resource.uri,
                            mimeType: resource.mimeType,
                            text: JSON.stringify(parsed)
                        }
                    ]
                };
            } catch (e) {
                return {
                    contents: [
                        {
                            uri: resource.uri,
                            mimeType: resource.mimeType,
                            text: body == null ? "" : "" + body
                        }
                    ]
                };
            }
        }

        try {
            var request = JSON.parse(context.getPassedMessageAsString());
            var params = request.params == null ? {} : request.params;
            var uri = params.uri;
            var resourceLookup = JSON.parse(
                context.sendToStep("registry", JSON.stringify({
                    action: "get-resource",
                    uri: uri
                })).getBody()
            );

            if (resourceLookup.ok !== true) {
                context.setBody(JSON.stringify(resourceLookup));
            } else {
                var resource = resourceLookup.result.resource;

                if (resource.source.type === "static") {
                    context.setBody(JSON.stringify({
                        ok: true,
                        result: normalizeStaticResource(resource)
                    }));
                } else {
                    var callbackPayload = {
                        uri: uri,
                        params: params,
                        resource: resource
                    };
                    var returnedContext = context.sendToStep(
                        resource.source.handler.deploymentAccessId,
                        resource.source.handler.stepId,
                        JSON.stringify(callbackPayload)
                    );

                    if (returnedContext.isErrored()) {
                        context.setBody(JSON.stringify(callbackError(returnedContext)));
                        return;
                    }

                    context.setBody(JSON.stringify({
                        ok: true,
                        result: normalizeDynamicResource(resource, returnedContext.getBody())
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
