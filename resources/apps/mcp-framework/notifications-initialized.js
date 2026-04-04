doc
    .description("Accepts the MCP notifications/initialized handshake notification")
    .inSchema({
        type: "object",
        required: ["jsonrpc", "method"],
        properties: {
            jsonrpc: { type: "string" },
            method: { type: "string" },
            params: { type: "object" }
        }
    })
    .outSchema({
        type: "object",
        required: ["ok", "result"],
        properties: {
            ok: { type: "boolean" },
            result: { type: "object" }
        }
    })
    .run(() => {
        context.setBody(JSON.stringify({
            ok: true,
            result: {}
        }));
    });
