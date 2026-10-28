doc
    .description("Computes per-index doc-count and size diffs from open Elasticsearch indexes and forwards metrics.")
    .dataSchema({
        type: "object",
        properties: {
            prefix: { type: "string" },
            processroute: { type: "string" }
        },
        required: ["processroute"]
    })
    .inSchema({
        type: "array",
        items: {
            type: "object",
            properties: {
                index: { type: "string" },
                status: { type: "string" },
                "docs.count": {},
                "pri.store.size": {},
                "store.size": {}
            }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const indexList = JSON.parse(body);
        const persistence = context.getTimestampManager();
        const temp = JSON.parse(context.getData());
        const prefix = temp["prefix"];
        const indexes = [];

        /* Getting the index name and docs number */
        const REX = /[\-]\d{4}[\.](0?[1-9]|1[012])[\.](0?[1-9]|[12][0-9]|3[01])$/; /* i.e match with : index_name-2021.11.17 */
        const REX2 = /[\-]\d{4}[\.](0?[1-9]|1[012])[\.](0?[1-9]|[12][0-9]|3[01])[\-]\d{6}$/; /* i.e match with : index_name-2021.11.17-000267 */
        const REX3 = /[\-]\d{6}$/; /* i.e match with : index_name-000256 */
        indexList.forEach(obj => {
            const ind = obj["index"];
            /* considering only the indexes which name end in a date -YYYY.MM.DD and ignoring indexes which start with a . */
            if (obj.status == "open" && ind.match(REX) && ind.charAt(0) != ".") {
                const removeDate = ind.slice(0, ind.length - 11);
                indexes.push([obj["index"], removeDate, { count: obj["docs.count"], ingestSize: obj["pri.store.size"], storeSize: obj["store.size"] }])
            }
            else if (obj.status == "open" && ind.match(REX2) && ind.charAt(0) != ".") {
                const removeDate = ind.slice(0, ind.length - 18);
                indexes.push([obj["index"], removeDate, { count: obj["docs.count"], ingestSize: obj["pri.store.size"], storeSize: obj["store.size"] }])
            }
            else if (obj.status == "open" && ind.match(REX3) && ind.charAt(0) != ".") {
                const removeDate = ind.slice(0, ind.length - 7);
                indexes.push([obj["index"], removeDate, { count: obj["docs.count"], ingestSize: obj["pri.store.size"], storeSize: obj["store.size"] }])
            }
        });

        /* sorting the indexes */
        indexes.sort();
        indexes.reverse();

        /* processing the data, because we've sorted, we take the first index of the named group 
           this means that we only work on the latest index for each group */
        const result = [];
        let currentIndex = "";
        const INDEX_NAME = 1;
        const OBJECT = 2;


        function processMetricType(persistencePrefix, metricPrefix, indexName, metricCurrentValue) {

            const metricName = persistencePrefix + indexName;

            const previousMetric = persistence.get(metricName);
            const currentMetric = parseFloat(metricCurrentValue);

            const metricname = metricPrefix + "-" + indexName;

            let metric;
            if (persistencePrefix == "INGEST_SIZE_") {
                metric = { metric: metricname, type: metricPrefix, '@timestamp': new Date().toISOString(), metadata: { "ad": "ad_ml", "ad_p": "1m" } };
            } else {
                metric = { metric: metricname, type: metricPrefix, '@timestamp': new Date().toISOString() }
            }
            if (!previousMetric || currentMetric < previousMetric) {
                metric.value = currentMetric;
            }
            else {
                metric.value = currentMetric - previousMetric;
            }

            result.push(metric);
            persistence.set(metricName, metricCurrentValue);
        }

        indexes.forEach(obj => {
            if (obj[INDEX_NAME] != currentIndex) {
                currentIndex = obj[INDEX_NAME];

                processMetricType("", "doc-count-diff", currentIndex, obj[OBJECT].count)
                processMetricType("INGEST_SIZE_", "ingest-size-diff", currentIndex, obj[OBJECT].ingestSize)
                processMetricType("STORE_SIZE_", "store-size-diff", currentIndex, obj[OBJECT].storeSize)

            }
        });
        /* sending the metrics */

        result.forEach(function (item) {
            context.sendToStep(context.getData("processroute"), JSON.stringify(item))
        });
    });
