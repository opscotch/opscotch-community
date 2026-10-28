doc
    .description("Emits App Search search/click rate metrics from a counts_by_time aggregation, advancing lastRun.")
    .inSchema({
        type: "object",
        required: ["aggregations"],
        properties: {
            aggregations: {
                type: "object",
                required: ["counts_by_time"],
                properties: {
                    counts_by_time: {
                        type: "object",
                        required: ["buckets"],
                        properties: {
                            buckets: { type: "array" }
                        }
                    }
                }
            }
        }
    })
    .run(() => {
        // maps elastic values to phm values
        const key_map = { "loco_moco_search": "elastic-appsearch-search-rate", "loco_moco_click": "elastic-appsearch-click-rate" };


        // by the nature of the aggregation, we can get buckets outside of the queried range, we'll just filter them with the last run time
        const lastRun = context.getTimestampManager().get("lastRun")

        JSON.parse(context.getMessageBodyAsString())["aggregations"]["counts_by_time"]["buckets"].forEach(timeBucket => {
            if (timeBucket.key > lastRun) {
                timeBucket.counts_by_action.buckets.forEach(item => {
                    context.sendMetric(timeBucket.key, key_map[item.key], item.doc_count);
                    context.getTimestampManager().setIfLastest("lastRun", timeBucket.key.toString());
                })
            }
        });
    });
