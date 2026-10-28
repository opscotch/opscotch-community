doc
    .description("Wraps an OpenClaw invoke upstream response with queued dispatcher metadata.")
    .inPropertySchema({
        type: "object",
        properties: {
            openclaw_agent: { type: "string" }
        }
    })
    .run(() => {
        function parseJson(value, fallback) {
            if (value === null || value === undefined || value === "") {
                return fallback;
            }
            return JSON.parse(value);
        }

        var upstream = parseJson(context.getBody(), {});
        context.setBody(JSON.stringify({
            queued: true,
            dispatcher: "openclaw-local-gateway",
            agent: String(context.getProperty("openclaw_agent") || ""),
            response: upstream
        }));
    });
