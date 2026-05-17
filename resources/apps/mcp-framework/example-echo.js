doc
    .description("Sample dynamic MCP tool callback that echoes the supplied text")
    .inSchema({
        type: "object",
        required: ["name", "namespace", "arguments", "tool"],
        properties: {
            name: { type: "string" },
            namespace: { type: "string" },
            arguments: {
                type: "object",
                properties: {
                    text: { type: "string" }
                }
            },
            tool: { type: "object" }
        }
    })
    .outSchema({
        type: "object",
        required: ["content"],
        properties: {
            content: { type: "array" },
            structuredContent: { type: "object" },
            isError: { type: "boolean" }
        }
    })
    .run(() => {
        try {
            var payload = JSON.parse(context.getPassedMessageAsString());
            var args = payload.arguments == null ? {} : payload.arguments;
            var text = args.text == null ? "" : "" + args.text;

            context.setBody(JSON.stringify({
                content: [
                    {
                        type: "text",
                        text: "sample echo: " + text
                    }
                ],
                structuredContent: {
                    echoedText: text,
                    namespace: payload.namespace,
                    tool: payload.name
                }
            }));
        } catch (e) {
            context.setProperty("status_code", 500);
            context.setBody(JSON.stringify({
                content: [
                    {
                        type: "text",
                        text: e.message
                    }
                ],
                isError: true
            }));
        }
    });
