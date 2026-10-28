doc
    .description("Forwards each JSON array item from the body to the step named by processroute.")
    .dataSchema({
        type: "object",
        required: ["processroute"],
        properties: {
            processroute: { type: "string" }
        }
    })
    .inSchema({
        type: "array"
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        console.log(body);
        const response = JSON.parse(body);

        response.forEach(item => context.sendToStep(context.getData("processroute"), JSON.stringify(item)))
    });
