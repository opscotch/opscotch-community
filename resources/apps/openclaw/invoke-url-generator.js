doc
    .description("Build POST URL and headers for OpenClaw invoke endpoint")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["agent"],
        additionalProperties: true,
        properties: {
            agent: {
                description: "Agent name to invoke at /agents/{agent}/invoke.",
                type: "string",
                minLength: 1
            }
        }
    })
    .dataSchema({
        type: "object",
        required: ["openclawGatewayHostId"],
        additionalProperties: true,
        properties: {
            openclawGatewayHostId: {
                description: "Bootstrap host id for the local OpenClaw gateway endpoint.",
                type: "string",
                minLength: 1
            }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var payload = parseJson(context.getBody(), {});
        var hostId = String(context.getData("openclawGatewayHostId")).trim();
        var agent = String(payload.agent).trim();

        context.setHttpMethod("POST");
        context.setUrl(hostId, "/agents/" + encodeURIComponent(agent) + "/invoke");
        context.setHeader("Content-Type", "application/json");
        context.setHeader("Accept", "application/json");
        context.setProperty("openclaw_agent", agent);
    });
