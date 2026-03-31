doc
    .description("Returns fixed MCP server metadata and capabilities")
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
            result: {
                protocolVersion: "2025-03-26",
                serverInfo: {
                    name: "opscotch-mcp-framework",
                    version: "0.1.0"
                },
                capabilities: {
                    tools: {
                        listChanged: false
                    },
                    resources: {
                        listChanged: false,
                        subscribe: false
                    },
                    prompts: {
                        listChanged: false
                    }
                }
            }
        }));
    });
