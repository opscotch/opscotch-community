doc
    .description("Accepts a cross-deployment MCP registration payload and applies it to the runtime registry")
    .inSchema({
        type: "object",
        required: ["namespace"],
        properties: {
            namespace: { type: "string" },
            replace: { type: "boolean" },
            tools: {
                type: "array",
                items: {
                    type: "object",
                    required: ["name", "handler", "annotations"],
                    properties: {
                        name: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        inputSchema: { type: "object" },
                        handler: { type: "object" },
                        annotations: {
                            type: "object",
                            required: ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"],
                            properties: {
                                readOnlyHint: { type: "boolean" },
                                destructiveHint: { type: "boolean" },
                                idempotentHint: { type: "boolean" },
                                openWorldHint: { type: "boolean" }
                            }
                        }
                    }
                }
            },
            resources: { type: "array" },
            prompts: { type: "array" }
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
        function run() {
            try {
                var payload = JSON.parse(context.getPassedMessageAsString());
                var registryResponse = JSON.parse(
                    context.sendToStep("registry", JSON.stringify({
                        action: "register",
                        payload: payload
                    })).getBody()
                );

                context.setBody(JSON.stringify(registryResponse));
            } catch (e) {
                context.setBody(JSON.stringify({
                    ok: false,
                    error: {
                        code: -32602,
                        message: e.message
                    }
                }));
            }
        }

        run();
    });
