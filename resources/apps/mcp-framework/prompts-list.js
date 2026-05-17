doc
    .description("Returns registered MCP prompt descriptors from the in-memory registry")
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
                    action: "list-prompts"
                })).getBody()
            );

            if (registryResponse.ok !== true) {
                context.setBody(JSON.stringify(registryResponse));
            } else {
                context.setBody(JSON.stringify({
                    ok: true,
                    result: {
                        prompts: registryResponse.result.prompts.map(function(prompt) {
                            return {
                                name: prompt.name,
                                title: prompt.title,
                                description: prompt.description,
                                arguments: prompt.arguments
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
