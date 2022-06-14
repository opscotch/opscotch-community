/*
Expects:
    - the body to be the response from /_cluster/settings?include_defaults=true

Sends the "elastic-cluster-master-eligible-nodes" metric
    - 0 ok
    - 1 fail
*/

function fromKey(keyArray, data) {
    if(keyArray.length == 1) {
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
    return typeof value === typeof undefined | value == null ? _default :  value;
}

// elastic can add "comments" in the response json that need to be removed
response = "";
context.getMessageBodyAsString().split(/\r?\n/).forEach(function(line) {
    if (!line.startsWith("#")){
        response = response + line + "\n";
    }
});

clusterSetings = JSON.parse(response);
// select the minimum_master_node in the following order default, persistent, transient such that if transient is set: use that.
minimumMasterNodes = fromJsonKey("transient.discovery.zen.minimum_master_nodes", clusterSetings);
minimumMasterNodes = valueOrDefault(minimumMasterNodes, fromJsonKey("persistent.discovery.zen.minimum_master_nodes", clusterSetings));
minimumMasterNodes = valueOrDefault(minimumMasterNodes, fromJsonKey("defaults.discovery.zen.minimum_master_nodes", clusterSetings));

masterEligibleNodes = context.getProperty("master-eligible-nodes");

metric = { metric: "elastic-cluster-master-eligible-nodes"};

/* the number of master eligible nodes must be 
    - Not 0
    - Not Even
    - discovery.zen.minimum_master_nodes < (master-eligible/2) + 1
*/
console.log ("masterEligibleNodes: " + masterEligibleNodes);
console.log ("minimumMasterNodes: " + minimumMasterNodes);
if (masterEligibleNodes != 0 && masterEligibleNodes % 2 != 0 && (masterEligibleNodes/2 + 1) > minimumMasterNodes ) {
    metric.value = 0
} else{
    metric.value = 1
}

context.sendToStep(context.getData("processroute"), JSON.stringify(metric))