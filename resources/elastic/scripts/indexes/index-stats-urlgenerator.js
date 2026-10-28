doc
    .description("Sets the Elasticsearch index _stats URL from the response index name and step data host-ref.")
    .dataSchema({
        type: "object",
        required: ["host-ref"],
        properties: {
            "host-ref": { type: "string" }
        }
    })
    .inSchema({
        type: "object",
        required: ["index"],
        properties: {
            index: { type: "string" }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);
        const data = JSON.parse(context.getData());
        context.setUrl(data["host-ref"], '/' + response.index + '/_stats');
    });
