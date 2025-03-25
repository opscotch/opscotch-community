const ACTION = context.getProperty("_action");
const METRICS = "_metrics";
const TIMESTAMP = "_timestamp";

var body = context.getBody();

var metricSet = new Set(JSON.parse(context.getPersistedItem(METRICS) ?? "[]"));

if (ACTION == "setmetric") {
    var metric = JSON.parse(body);
    var metricKey = metric.name;    
    
    if (!metricSet.has(metricKey)) {
        metricSet.add(metricKey);
        context.setPersistedItem(METRICS, JSON.stringify(Array.from(metricSet)));
    }

    metricValue = context.counter(metricKey, metric.value);
} else {
    // get metrics url
    if (body) {
        var response = { timestamp : context.getPersistedItem(TIMESTAMP)};
        for (const metricKey of metricSet) {
            response[metricKey] = context.counter(metricKey, 0);
        }
                
        context.setHeader("Access-Control-Allow-Origin", "*");
        context.setMessage(JSON.stringify(response));
        context.end();
    } else {
        // timer: reset all counters
        const now = new Date();
        context.setPersistedItem(TIMESTAMP, `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
        
        for (metricKey of metricSet) {
            context.counter(metricKey, context.counter(metricKey, 0) * -1);
        }
    }
}

