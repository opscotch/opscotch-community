doc
    .description("Accepts the MCP ping request and returns an empty result")
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
