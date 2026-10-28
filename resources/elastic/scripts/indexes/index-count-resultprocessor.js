doc
    .description("Sends an elastic-index-count metric from the number of newline-separated rows in the response body.")
    .run(() => {
        context.sendMetric(context.getTimestamp(), "elastic-index-count", context.getMessageBodyAsString().split("\n").length);
    });
