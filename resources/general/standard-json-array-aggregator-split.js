doc
    .description("Splits each item from a JSON array body into split return items for per-item processing.")
    .inSchema({
        type: "array"
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const response = JSON.parse(body);

        response.forEach(item => context.addSplitReturnItem(JSON.stringify(item)))
    });
