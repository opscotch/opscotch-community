doc
    .description("Persists min/max timestamps from Elasticsearch hits and forwards hits.hits to processroute.")
    .dataSchema({
        type: "object",
        required: ["processroute", "idProperty"],
        properties: {
            processroute: { type: "string" },
            idProperty: { type: "string" },
            timestampField: { type: "string" }
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
        const id = context.getProperty(context.getData("idProperty"));

        let minTimestamp = null;
        let maxTimestamp = null;
        const timestampField = context.getData("timestampField")

        if (timestampField) {
            const persistence = context.getTimestampManager();
            response.hits.hits.forEach(hit => {
                const timestamp = hit._source[timestampField];
                minTimestamp = Math.min(minTimestamp, timestamp);
                maxTimestamp = Math.max(maxTimestamp, timestamp);
            });

            if (maxTimestamp) {
                persistence.set(id + "maxTimestamp", "" + maxTimestamp);
                persistence.set(id + "minTimestamp", "" + minTimestamp);
            }

        }

        context.sendToStep(context.getData("processroute"), JSON.stringify(response.hits.hits));
    });
