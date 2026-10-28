doc
    .description("Saves the current message body into the workflow property named by step data propertyName.")
    .dataSchema({
        type: "object",
        required: ["propertyName"],
        properties: {
            propertyName: { type: "string" }
        }
    })
    .run(() => {
        context.setProperty(context.getData("propertyName"), context.getMessageBodyAsString());
    });
