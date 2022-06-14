// {
//     "e50-appd_metric-2020.08.26": {
//         "settings": {
//             "index": {
//                 "lifecycle": {
//                     "name": "purge_old"
//                 },
//                 "number_of_shards": "1",
//                 "provided_name": "e50-appd_metric-2020.08.26",
//                 "creation_date": "1598400087564",
//                 "priority": "100",
//                 "number_of_replicas": "0",
//                 "uuid": "eZ_Wr7ppQ7ehMwTy_ZAHww",
//                 "version": {
//                     "created": "7040299"
//                 }
//             }
//         }
//     },
//     ...
// }

body = context.getMessageBodyAsString();
response = JSON.parse(body);

totalCount = 0;
validIlmCount = 0;

for (let k in response) {
    index = response[k];
    ilmName = "none";

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

context.sendMetric("elastic-ilm-managed-index-pct", validIlmCount/totalCount);