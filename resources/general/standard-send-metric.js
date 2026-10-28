doc
    .description("Sends a metric from a passed message containing metric, value, and optional metadata.")
    .run(() => {
        const body = JSON.parse(context.getPassedMessageAsString());

        if (body.metadata) {
            context.sendMetric(context.getTimestamp(), body.metric, body.value, body.metadata);
        } else {
            context.sendMetric(context.getTimestamp(), body.metric, body.value);
        }
    });
