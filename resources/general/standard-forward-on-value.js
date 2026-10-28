doc
    .description("Forwards the body to a step chosen from forwardOnValue using a body field, with optional _default.")
    .dataSchema({
        type: "object",
        required: ["useField", "forwardOnValue"],
        properties: {
            useField: { type: "string" },
            forwardOnValue: {
                type: "object",
                additionalProperties: { type: "string" }
            }
        }
    })
    .inSchema({
        type: "object"
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const json = JSON.parse(body);

        const field = context.getData("useField");

        const forwarders = JSON.parse(context.getData("forwardOnValue"));

        const forwardTo = forwarders["" + json[field]] ?? forwarders["_default"];

        context.sendToStep(forwardTo, body);
    });
