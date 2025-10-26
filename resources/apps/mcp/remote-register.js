doc
.inSchema({
    type: "object",
    required : [ "tool", "host" ],
    properties: {
        host : {
            type : "object",
            required : [ "hostref", "path" ],
            properties : {
                hostref : {
                    type : "string"    
                },
                path : {
                    type : "string"
                }
            }
        },
        tool: {
            type: "object",
            required: ["stepId", "name", "description"],
            properties: {
                stepId: {
                type: "string",
                },
                name: {
                type: "string",
                },
                title: {
                type: "string",
                },
                description: {
                type: "string",
                },
                inputSchema: {
                type: "object",
                additionalProperties: true,
                },
                outputSchema: {
                type: "object",
                additionalProperties: true,
                },
            },
        }
    }
})
.run(() => {
    const registration = JSON.parse(context.getBody());
    const responseContext = context.sendToStep("mcp.controller", JSON.stringify({ 
        command : "register", 
        register: registration
    }));

    if (responseContext.isErrored()) {
        context.setProperty("status_code", 400);
        context.setBody(JSON.stringify({
            error: responseContext.getErrors()[0]
        }));
        context.end();
    }

    context.setProperty("status_code", 200);
    context.setBody(JSON.stringify({
        status: "ok"
    }));
    context.end();
});