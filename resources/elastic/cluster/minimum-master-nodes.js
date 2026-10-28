doc
    .description("Evaluates Elasticsearch minimum_master_nodes against master-eligible-nodes and forwards a pass/fail metric.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" }
        }
    })
    .inPropertySchema({
        type: "object",
        required: ["master-eligible-nodes"],
        properties: {
            "master-eligible-nodes": { type: ["string", "number"] }
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
        // select the minimum_master_node in the following order default, persistent, transient such that if transient is set: use that.
        let minimumMasterNodes = fromJsonKey("transient.discovery.zen.minimum_master_nodes", clusterSetings);
        minimumMasterNodes = valueOrDefault(minimumMasterNodes, fromJsonKey("persistent.discovery.zen.minimum_master_nodes", clusterSetings));
        minimumMasterNodes = valueOrDefault(minimumMasterNodes, fromJsonKey("defaults.discovery.zen.minimum_master_nodes", clusterSetings));

        const masterEligibleNodes = context.getProperty("master-eligible-nodes");

        const metric = { metric: "elastic-cluster-master-eligible-nodes" };

        /* the number of master eligible nodes must be 
            - Not 0
            - Not Even
            - discovery.zen.minimum_master_nodes < (master-eligible/2) + 1
        */
        //console.log ("masterEligibleNodes: " + masterEligibleNodes);
        //console.log ("minimumMasterNodes: " + minimumMasterNodes);
        if (masterEligibleNodes != 0 && masterEligibleNodes % 2 != 0 && (masterEligibleNodes / 2 + 1) > minimumMasterNodes) {
            metric.value = 0
        } else {
            metric.value = 1
        }

        context.sendToStep(context.getData("processroute"), JSON.stringify(metric))
    });
