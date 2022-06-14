/*
Expects the following format as the body, and sends the metric

{
  "metric" : "<metric name>",
  "value" : <metric value>
}

This is useful when you don't want to do the metric sending in your function, so you can reuse the function without being forced to do sending
*/
body = JSON.parse(context.getPassedMessageAsString());

if (body.metadata) {
  context.sendMetric(context.getTimestamp(), body.metric, body.value, body.metadata);
} else {
  context.sendMetric(context.getTimestamp(), body.metric, body.value);
}
