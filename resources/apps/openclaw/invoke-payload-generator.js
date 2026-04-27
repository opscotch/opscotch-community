doc
    .description("Build request payload for OpenClaw agent invoke")
    .asUserErrors()
    .inSchema({
        type: "object",
        required: ["input"],
        additionalProperties: true,
        properties: {
            agent: {
                description: "Optional agent name. URL generator uses this if present.",
                type: "string"
            },
            input: {
                description: "Direct OpenClaw input payload object.",
                type: "object"
            },
            metadata: {
                description: "Optional metadata object passed through to OpenClaw.",
                type: "object"
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
        context.setBody(JSON.stringify(
            payload.metadata === undefined
                ? { input: payload.input }
                : { input: payload.input, metadata: payload.metadata }
        ));
    });
