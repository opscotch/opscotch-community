doc
    .description("Sends elastic-cluster-shards-available from cluster max_shards_per_node minus elastic-used-shards.")
    .inPropertySchema({
        type: "object",
        required: ["elastic-used-shards"],
        properties: {
            "elastic-used-shards": { type: ["string", "number"] }
        }
    })
    .inSchema({
        type: ["object", "string"]
    })
    .run(() => {
        function fromKey(keyArray, data) {
            if (keyArray.length == 1) {
                return data[keyArray[0]];
            } else if (typeof data[keyArray[0]] === typeof undefined) {
                return null;
            } else {
                return fromKey(keyArray.slice(1), data[keyArray[0]])
            }
        }

        function fromJsonKey(jsonKey, data) {
            return fromKey(jsonKey.split("."), data)
        }

        function valueOrDefault(value, _default) {
            return typeof value === typeof undefined | value == null ? _default : value;
        }

        // elastic can add "comments" in the response json that need to be removed
        let response = "";
        context.getMessageBodyAsString().split(/\r?\n/).forEach(function (line) {
            if (!line.startsWith("#")) {
                response = response + line + "\n";
            }
        });
        const clusterSetings = JSON.parse(response);

        // select the shard limit in the following order default, persistent, transient such that if transient is set: use that.
        let shardLimit = fromJsonKey("transient.cluster.max_shards_per_node", clusterSetings);
        shardLimit = valueOrDefault(shardLimit, fromJsonKey("persistent.cluster.max_shards_per_node", clusterSetings));
        shardLimit = valueOrDefault(shardLimit, fromJsonKey("defaults.cluster.max_shards_per_node", clusterSetings));

        const shardsUsed = context.getProperty("elastic-used-shards");

        context.sendMetric("elastic-cluster-shards-available", shardLimit - shardsUsed);
    });
