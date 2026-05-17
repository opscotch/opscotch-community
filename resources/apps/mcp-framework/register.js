doc
    .description("Accepts a cross-deployment MCP registration payload and applies it to the runtime registry")
    .inSchema({
        type: "object",
        required: ["namespace"],
        properties: {
            namespace: { type: "string" },
            replace: { type: "boolean" },
            tools: { type: "array" },
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
