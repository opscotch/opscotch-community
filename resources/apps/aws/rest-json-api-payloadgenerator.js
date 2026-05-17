doc
    .inSchema(
        {
            type : "object",
            required : [ "path", "method" ],
            properties : {
                path : {
                    type : "string"
                },
                method : {
                    type : "string"
                },
                body : {
                    type : "object"
                }
            }
        }
    )
    .run(() => {
        const input = JSON.parse(context.getBody());
        context.removeAllHeaders(); 
        context.setHttpMethod(input.method); 
        context.setProperty("method", input.method);
        context.setHeader("Content-Type", "application/json");

        if (input.body) {
            context.setBody(JSON.stringify(input.body));
        }
    });