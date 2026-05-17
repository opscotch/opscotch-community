doc
    .description("Returns registered MCP resource descriptors from the in-memory registry")
    .inSchema({
        type: "object",
        required: ["jsonrpc", "id", "method"],
        properties: {
            jsonrpc: { type: "string" },
            id: {},
            method: { type: "string" },
            params: { type: "object" }
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
        try {
            var registryResponse = JSON.parse(
                context.sendToStep("registry", JSON.stringify({
                    action: "list-resources"
                })).getBody()
            );

            if (registryResponse.ok !== true) {
                context.setBody(JSON.stringify(registryResponse));
            } else {
                context.setBody(JSON.stringify({
                    ok: true,
                    result: {
                        resources: registryResponse.result.resources.map(function(resource) {
                            return {
                                uri: resource.uri,
                                name: resource.name,
                                description: resource.description,
                                mimeType: resource.mimeType
                            };
                        })
                    }
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
