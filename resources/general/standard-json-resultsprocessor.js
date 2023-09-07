/*
 Takes a data dictionary (from the config) of json property names from the response, and maps them to metric name
 and sends a metric, unless the "processroute" property is set and it will forward to that step

 "resultsProcessor": {
     "resource": "/routes/general/standard-json-resultsprocessor.js",
     "data" : {
       "sum" : {
         "nested.item.number_of_nodes" : "elastic-cluster-number-of-nodes",
         "active_primary_shards" : "elastic-cluster-active-primary-shards",
         "active_shards_percent_as_number" : "elastic-cluster-active-shards_percent"
       },
       "truecount" : { .. },
       "deltasum" : { .. },
       "processroute" : "... this is optional if forwarding rather than sending a metric"
     }
   }
 */
jsonBody = JSON.parse(context.getMessageBodyAsString());

metricFunctions = {
    "sum" : {
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? 0 : aggregate;
            return aggregate += current; 
        }
    },
    "max" : {
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? current : aggregate;
            return aggregate > current ? aggregate : current; 
        }
    },
    "min" : {
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? current : aggregate;
            return aggregate < current ? aggregate : current; 
        }
    },
    
    // counts the number of true values
    "truecount"  : { 
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? 0 : aggregate;
            return current === true ? ++aggregate : aggregate;  
        }
    },
    
    // sums the values then subtracts the previous value to give the difference
    "deltasum" : { 
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? 0 : aggregate;
            return aggregate += current; 
        },
        "aggregate" : function(key, aggregate, current) { return context.delta(key, aggregate); }
    },
    
    // sums the values then subtracts the previous value to give the difference, 
    // unless the value is less than the previous, then returns 0;
    // Suits a counter style value that only increases (except when it doesn't)
    "counterdeltasum" : { 
        "each" : function(key, aggregate, current) { 
            aggregate = aggregate == null ? 0 : aggregate;
            return aggregate += current; 
        },
        "aggregate" : function(key, aggregate, current) { 
            persistence = context.getTimestampManager();
            previous = persistence.get(key);
            if ( aggregate < previous) {
                // we need to reset the counter
                persistence.set(key, 0);
                return 0;
            }
            return context.delta(key, aggregate); 
        }
    }
}

function fromKey(keyArray, data) {
    if(keyArray.length == 1) {
        return data[keyArray[0]];
    } else {
        return fromKey(keyArray.slice(1), data[keyArray[0]])
    }
}

if (!Array.isArray(jsonBody)) {
    jsonBody = [ jsonBody ];
}

forwardResponse = {};

// Check configuration for each of the known metric functions
Object.keys(metricFunctions).forEach(function(metricFunctionKey) {
    metricConfig = context.getData(metricFunctionKey);
    if (metricConfig) {
        metricConfig = JSON.parse(context.getData(metricFunctionKey));
        // process each json path and map to a value using the metric function
        Object.keys(metricConfig).forEach(function(k) {
            aggregate = null;
            jsonBody.forEach(function(data){
                try {
                    value = fromKey(k.split("."), data)

                    // apply the specific metric function to each record
                    aggregate = metricFunctions[metricFunctionKey].each(k, aggregate, value);

                } catch(err) {
                    console.log(err);
                }
            });

            // apply (if any) aggregating functions
            if (metricFunctions[metricFunctionKey].aggregate) {
                aggregate = metricFunctions[metricFunctionKey].aggregate(k, aggregate, value);
            }

            if (aggregate == null) {
                console.log("aggregate should not be null");
            }

            if (context.getData("processroute")) {
                forwardResponse[metricConfig[k]] = aggregate;
            } else {
                context.sendMetric(context.getTimestamp(), context.getData("prefix") + metricConfig[k], aggregate);
            }
        })
    }
});

if (context.getData("processroute")) {
    context.sendToStep(context.getData("processroute"), JSON.stringify(forwardResponse));
}

