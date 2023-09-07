/*
Expects results from an elastic query. Will extract the min and max timestamp from the results,
to use for the next query.

Expects:
- timestampField data property to have been set which refers to the timestamp field in the results
- idProperty data property to have been set which refers the the property that holds the "query id"
- processroute data property to have been set to send results to

Will persist the minTimestamp and maxTimestamp for the results for use in the query next time
*/

body = context.getMessageBodyAsString();
response = JSON.parse(body);
id = context.getProperty(context.getData("idProperty"));

minTimestamp = null;
maxTimestamp = null;
timestampField = context.getData("timestampField")

if(timestampField) {
    persistence = context.getTimestampManager();
    response.hits.hits.forEach(hit => {
        timestamp = hit._source[timestampField];
        minTimestamp = Math.min(minTimestamp, timestamp);
        maxTimestamp = Math.max(maxTimestamp, timestamp);
    });

    if(maxTimestamp) {
        persistence.set(id+"maxTimestamp", ""+maxTimestamp);
        persistence.set(id+"minTimestamp", ""+minTimestamp);
    }
    
}

context.sendToStep(context.getData("processroute"), JSON.stringify(response.hits.hits));
