doc
    .description("Splits open Elasticsearch index status items from a JSON array response.")
    .inSchema({
        type: "array",
        items: {
            type: "object",
            properties: {
                status: { type: "string" }
            }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);

        response.forEach(item => {
            if (item.status == "open") context.addSplitReturnItem(JSON.stringify(item))
        });
    });
