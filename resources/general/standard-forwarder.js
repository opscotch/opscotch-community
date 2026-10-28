doc
    .description("Forwards the current message body to the step named by processroute.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        context.sendToStep(context.getData("processroute"), body)
    });
