doc
    .description("Sets CORS response headers from step data addHeaders, or defaults Access-Control-Allow-Origin to *.")
    .dataSchema({
        type: "object",
        properties: {
            addHeaders: {
                type: "array",
                items: { type: "string" }
            }
        }
    })
    .run(() => {
        var addHeaders = context.getData("addHeaders");
        if (addHeaders) {
            addHeaders = JSON.parse(addHeaders);
            for (const header of addHeaders) {
                context.setHeader(header, context.getData(header));
            }
        } else {
            context.setHeader("Access-Control-Allow-Origin", "*");
        }
    });
