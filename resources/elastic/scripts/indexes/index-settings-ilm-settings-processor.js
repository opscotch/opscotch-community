doc
    .description("Computes the percentage of Elasticsearch indexes that have an ILM lifecycle policy configured.")
    .inSchema({
        type: "object",
        additionalProperties: {
            type: "object"
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);

        let totalCount = 0;
        let validIlmCount = 0;

        for (let k in response) {
            const index = response[k];
            const ilmName = "none";

            if (index["settings"]
                && index["settings"]["index"]
                && index["settings"]["index"]["lifecycle"]
                && index["settings"]["index"]["lifecycle"]["name"]) {
                validIlmCount++;
            } else {
                context.diagnosticLog(k + " has no ILM policy");
            }
            totalCount++
        };

        context.sendMetric("elastic-ilm-managed-index-pct", validIlmCount / totalCount);
    });
