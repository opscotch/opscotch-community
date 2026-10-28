doc
    .description("Forwards Elasticsearch hits.hits from a query response to the step named by processroute.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["hits"],
        properties: {
            hits: {
                type: "object",
                required: ["hits"],
                properties: {
                    hits: { type: "array" }
                }
            }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);
        context.sendToStep(context.getData("processroute"), JSON.stringify(response.hits.hits));
    });
