doc
    .description("Returns registered MCP tool descriptors from the in-memory registry")
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
                    action: "list-tools"
                })).getBody()
            );

            if (registryResponse.ok !== true) {
                context.setBody(JSON.stringify(registryResponse));
            } else {
                context.setBody(JSON.stringify({
                    ok: true,
                    result: {
                        tools: registryResponse.result.tools.map(function(tool) {
                            return {
                                name: tool.name,
                                title: tool.title,
                                description: tool.description,
                                inputSchema: tool.inputSchema
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
