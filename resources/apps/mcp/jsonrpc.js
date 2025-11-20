doc.inSchema(
    {
        type : "object",
        properties: {
            jsonrpc: {
                type: "string",
                const: "2.0"
            },
            method : {
                type: "string",
                description: "The name of the method to be invoked (e.g., 'tools/list', 'tools/call')"
            },
            params: {
                description: "Method-specific parameters",
                type: ["object", "array"],
                additionalProperties: true
            },
            id: {
                description: "Unique identifier for the request. Must be omitted for notifications.",
                type: ["string", "integer"]
            }
        },
        required: ["jsonrpc", "method"]
    }
)
.run(() => {

    console.log("jsonrpc request format accepted");

    const json = JSON.parse(context.getBody());

    context.diagnostic().setAttribute("jsonrpc.method", json.method);
    if (json.id) {
        context.diagnostic().setAttribute("jsonrpc.id", json.id);
    }

    const responseContext = context.sendToStep("mcp.controller", JSON.stringify({
        command : "jsonrpc",
        jsonrpc : {
            method : json.method,
            params: json.params,
            id: json.id
        }
    }));

    const e = responseContext.getProperty("error");
    if(e) {
        context.setBody(e);
        context.end();
    }

    const jsonRpcResponse = {
        jsonrpc: "2.0",
        id : json.id,
        result : JSON.parse(responseContext.getBody())
    }

    context.setBody(JSON.stringify(jsonRpcResponse));
});