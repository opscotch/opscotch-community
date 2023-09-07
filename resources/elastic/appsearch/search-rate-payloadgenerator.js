tm = context.getTimestampManager();
now = context.getTimestamp();

fromTime = tm.get("lastRun");
// if there was a lastRun then use that, otherwise use 30 days ago (in milliseconds)
fromTime = fromTime ? fromTime : now - ( 60 * 60 * 24 * 7 * 1000);

// current time minus 1 minute rounded down
toTime = (Math.floor(now / 60000)  * 60000) - 60000 ; 

elasticQuery =
{
    "size": 0,
    "query": {
        "bool": {
            "must_not": [{ "term": { "event.query_string": { "value": "" } } }],
            "filter": [{ "range": { "@timestamp": { "gte": "" + fromTime + "" , "lt": "" + toTime + "" } } }]
        }
    }, "aggs": {
        "counts_by_time": {
            "date_histogram": { "field": "@timestamp", "fixed_interval": "1m" },
            "aggs": { "counts_by_action": { "terms": { "field": "event.action" } } }
        }
    }
}

context.setMessage(JSON.stringify(elasticQuery))